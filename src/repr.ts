// This file is responsible for sending and receiving
// ([repr]esenting) data types over streams

import { Session } from "./session";
import { range, rangeCheck, Readable, Writable } from "./common";
import { ValuedEntity, SpecSpace } from "./things";

// Generic data representation class
export abstract class DataRepr<T> {
    specSpace?: SpecSpace;
    session?: Session;

    abstract write(stream: Writable, value: T): Promise<void>;
    abstract read(stream: Readable): Promise<T>;
    abstract findError(value: T): string|null;
}
// The type that a DataRepr encloses
export type TsType<T> = T extends DataRepr<infer R> ? R : never;

interface IntValidators {
    val?: range;
}
export class Int extends DataRepr<number> {
    size: number;
    validators?: IntValidators;

    constructor(size: number, validators?: IntValidators) {
        if(size > 4)
            throw new Error("`Int`s are limited to 4 bytes due to JavaScript Number precision limitations. Consider using a `BigInteger` repr instead.");
        super();
        this.size = size;
        this.validators = validators;
    }

    override async write(stream: Writable, value: number) {
        const data = new Uint8Array(this.size);
        for(let i = 0; i < this.size; i++) {
            data[i] = value & 0xFF;
            value >>= 8;
        }
        await stream.write(data.reverse());
    }

    override async read(stream: Readable): Promise<number> {
        let value = 0;
        const data = await stream.read(this.size);
        for(let i = 0; i < this.size; i++)
            value |= data[i] << ((this.size - i - 1) * 8);
        return value;
    }

    override findError(value: number) {
        if(this.validators?.val) {
            const [low, high] = this.validators.val;
            if(value < low || value > high)
                return `Int[val]: "${value}" is out of range ${low}..${high}`;
        }
        return null;
    }
}

interface BigIntValidators {
    val?: [bigint, bigint];
}
// polyfill-friendly BigInt serialization
export class BigInteger extends DataRepr<bigint> {
    size: number;
    validators?: BigIntValidators;

    static polyfillMode: "none"|"0x"|"radix" = "none";

    constructor(size: number, validators?: BigIntValidators) {
        super();
        this.size = size;
        this.validators = validators;
    }

    override async write(stream: Writable, value: bigint) {
        const data = new Uint8Array(this.size);
        if(BigInteger.polyfillMode === "none") {
            // snip bytes off
            for(let i = 0; i < this.size; i++) {
                data[i] = Number(value & BigInt(0xFF));
                value >>= BigInt(8);
            }

            data.reverse();
        } else {
            // convert value to hex and write from left to right
            const valStr = value.toString(16).padStart(this.size * 2, "0");

            for(let i = 0; i < this.size; i++)
                data[i] = parseInt(valStr.slice(i * 2, (i + 1) * 2), 16);
        }
        await stream.write(data);
    }

    override async read(stream: Readable): Promise<bigint> {
        const data = await stream.read(this.size);
        if(BigInteger.polyfillMode === "none") {
            // fill bytes in
            data.reverse();
            let value = BigInt(0);

            for(let i = 0; i < this.size; i++)
                value |= BigInt(data[i]) << BigInt(i * 8);

            return value;
        } else {
            // start with 0x or nothing depending on mode
            let valStr = BigInteger.polyfillMode === "0x" ? "0x" : "";

            // fill data in as hex
            for(let i = 0; i < this.size; i++)
                valStr += data[i].toString(16).padStart(2, "0");

            // convert hex string to bigint
            if(BigInteger.polyfillMode === "radix") {
                // @ts-expect-error non-standard!
                return BigInt(valStr, 16);
            }
            return BigInt(valStr);
        }
    }

    override findError(value: bigint) {
        if(this.validators?.val) {
            const [low, high] = this.validators.val;
            if(value < low || value > high)
                return `BigInt[val]: "${value}" is out of range ${low}..${high}`;
        }
        return null;
    }
}

export class Bool extends DataRepr<boolean> {
    constructor(_validators?: any) {
        super();
    }

    override async write(stream: Writable, value: boolean) {
        await new Int(1).write(stream, value ? 1 : 0);
    }

    override async read(stream: Readable): Promise<boolean> {
        const val = await new Int(1).read(stream);
        return val !== 0;
    }

    override findError(_value: boolean) {
        return null;
    }
}

interface StrValidators {
    len?: range;
    match?: RegExp;
}
export class Str extends DataRepr<string> {
    validators?: StrValidators;
    private readonly lenRepr: Int;
    private readonly encoder = new TextEncoder();
    private readonly decoder = new TextDecoder();

    constructor(validators?: StrValidators) {
        super();
        this.validators = validators;
        this.lenRepr = new Int(2);
    }

    override async write(stream: Writable, value: string) {
        const data = this.encoder.encode(value);
        await this.lenRepr.write(stream, value.length);
        await stream.write(data);
    }

    override async read(stream: Readable): Promise<string> {
        const len = await this.lenRepr.read(stream);
        const utf8 = await stream.read(len);
        return this.decoder.decode(utf8);
    }

    override findError(value: string) {
        if(this.validators?.len) {
            const [low, high] = this.validators.len;
            if(!rangeCheck(this.validators.len, value.length))
                return `Str[len]: "${value.length}" is out of range ${low}..${high}`;
        }
        if(this.validators?.match) {
            const pass = this.validators.match.test(value);
            if(!pass)
                return `Str[match]: "${value}" does not match ${this.validators.match.toString()}`;
        }
        return null;
    }
}

// Full list or partial list update
const partialModes = ["append", "prepend", "insert", "remove"];
export type ListOrUpdate<T> = T[] | ListUpdate<T>;
export type ListUpdate<T> = T[] & (
      { partial: "append" | "prepend", count: number }
    | { partial: "insert" | "remove", index: number, count: number });

function extractObject<S extends { [K: string]: any }>(source: S, ...keys: string[]) {
    const result = {} as { [K: string]: any };
    for(const key of keys)
        result[key] = source[key];
    return result;
}
// Merges a PLU with an existing list and assigns PLU metadata to it
export function mergePlu<T>(source: T[], update: ListOrUpdate<T>): T[] {
    if("partial" in update) {
        const partial = update.partial;
        const result = [...source];

        if(partial === "append") result.push(...update);
        if(partial === "prepend") result.unshift(...update);
        if(partial === "insert") result.splice(update.index, 0, ...update);
        if(partial === "remove") result.splice(update.index, update.count);
        return Object.assign(result, extractObject(update, "partial", "count", "index"));
    } else {
        return update;
    }
}

interface ListValidators {
    len?: range;
}
export class List<T> extends DataRepr<ListOrUpdate<T>> {
    itemRepr: DataRepr<T>;
    validators?: ListValidators;

    private szRepr: Int;

    constructor(itemRepr: DataRepr<T>, szLen: number, validators?: ListValidators) {
        super();
        this.itemRepr = itemRepr;
        this.szRepr = new Int(szLen);
        this.validators = validators;
    }

    override async write(stream: Writable, value: ListOrUpdate<T>) {
        if("partial" in value) {
            const partial = value.partial;
            const modeId = partialModes.indexOf(partial);

            // write mode byte and count
            await new Int(1).write(stream, 0xF0 | modeId);
            await this.szRepr.write(stream, value.count);

            // append/prepend: write modified data
            if(partial === "append" || partial === "prepend") {
                const slice = partial === "append"
                    ? value.slice(-value.count)
                    : value.slice(0, value.count);

                for(const item of slice)
                    await this.itemRepr.write(stream, item);
            }

            // insert: write index and list
            if(partial === "insert") {
                await this.szRepr.write(stream, value.index);
                for(const item of value.slice(value.index, value.index + value.count))
                    await this.itemRepr.write(stream, item);
            }

            // remove: write index
            if(partial === "remove")
                await this.szRepr.write(stream, value.index);
        } else {
            // plain list
            await this.szRepr.write(stream, value.length);
            for(const item of value)
                await this.itemRepr.write(stream, item);
        }
    }

    override async read(stream: Readable): Promise<ListOrUpdate<T>> {
        // read one byte of length (could be partial mode)
        const [msb] = await stream.read(1);

        // check if it's a partial update
        if(msb >> 4 === 0xF) {
            const modeId = msb & 0xF;
            const partial = partialModes[modeId];
            const count = await this.szRepr.read(stream);

            // append/prepend: read list
            if(partial === "append" || partial === "prepend") {
                const list = [];
                for(let i = 0; i < count; i++)
                    list.push(await this.itemRepr.read(stream));
                return Object.assign(list, { partial, count });
            }

            // insert: read index and list
            if(partial === "insert") {
                const index = await this.szRepr.read(stream);
                const list = [];
                for(let i = 0; i < count; i++)
                    list.push(await this.itemRepr.read(stream));
                return Object.assign(list, { partial, index, count });
            }

            // remove: read index
            if(partial === "remove") {
                const index = await this.szRepr.read(stream);
                return Object.assign([], { partial, index, count });
            }

            throw new Error(`Unknown partial mode: ${modeId}`);
        } else {
            const remSize = this.szRepr.size - 1;
            const count = await new Int(remSize).read(stream)
                        | msb << (8 * remSize);

            // full list
            const list: T[] = [];
            for(let i = 0; i < count; i++)
                list.push(await this.itemRepr.read(stream));
            return list;
        }
    }

    override findError(value: T[]) {
        if(this.validators?.len) {
            const [low, high] = this.validators.len;
            if(!rangeCheck(this.validators.len, value.length))
                return `List[len]: "${value.length}" is out of range ${low}..${high}`;
        }

        for(let i = 0; i < value.length; i++) {
            const item = value[i];
            const error = this.itemRepr.findError(item);
            if(error)
                return `List item[${i}]: ${error}`;
        }

        return null;
    }
}

interface BinValidators {
    len?: range;
}
export class Bin extends DataRepr<Uint8Array> {
    validators?: BinValidators;

    private szRepr: Int;

    constructor(validators?: BinValidators) {
        super();
        this.szRepr = new Int(2);
        this.validators = validators;
    }

    override async write(stream: Writable, value: Uint8Array) {
        await this.szRepr.write(stream, value.length);
        await stream.write(value);
    }

    override async read(stream: Readable): Promise<Uint8Array> {
        const len = await this.szRepr.read(stream);
        return await stream.read(len);
    }

    override findError(value: Uint8Array) {
        if(this.validators?.len) {
            const [low, high] = this.validators.len;
            if(!rangeCheck(this.validators.len, value.length))
                return `Bin[len]: "${value.length}" is out of range ${low}..${high}`;
        }

        return null;
    }
}

export interface FieldSpec {
    required: { [name: string]: DataRepr<any> };
    optional: { [name: string]: readonly [number, DataRepr<any>] };
}

export type FieldValue<Spec extends FieldSpec> =
    { [K in keyof Spec["required"]]: TsType<Spec["required"][K]> } &
    { [K in keyof Spec["optional"]]?: TsType<Spec["optional"][K][1]> };

export type FieldKeys<Spec extends FieldSpec> = keyof Spec["required"] | keyof Spec["optional"];

export function getTypeOfKey(spec: FieldSpec, key: string): DataRepr<any>|undefined {
    if(key in spec.required)
        return spec.required[key];
    if(key in spec.optional)
        return spec.optional[key][1];
}

export class FieldArray<Spec extends FieldSpec, Value extends FieldValue<Spec>> extends DataRepr<Value> {
    // The line above just makes sure that we only pass fields with valid names and values to the functions

    spec: FieldSpec;
    private readonly _hpSelLen: number; // high-packing mode selection bitfield length
    hasOptional = false;
    highPacking = false;

    constructor(spec: Spec) {
        super();
        this.spec = spec;

        // calculate overhead
        const maxOptional = Object.values(this.spec.optional)
            .map(x => x[0])
            .reduce((acc, x) => Math.max(acc, x), 0);
        this._hpSelLen = Math.ceil((maxOptional + 3) / 8);
    }

    // chooses the optimal encoding mode for a value
    // returns `[at_least_one_optional, high_packing]`
    chooseMode(value: object): [boolean, boolean] {
        const optional = Object.keys(value).filter(k => k in this.spec.optional).length;

        if(optional === 0) {
            this.hasOptional = false;
        } else {
            this.hasOptional = true;
            const normalOverhead = 1 + optional;
            this.highPacking = normalOverhead > this._hpSelLen;
        }

        return [this.hasOptional, this.highPacking];
    }

    setMode(mode: [boolean, boolean]) {
        [this.hasOptional, this.highPacking] = mode;
    }

    override async write(stream: Writable, value: Value) {
        // write required fields
        for(const k in this.spec.required)
            await this.spec.required[k].write(stream, value[k]);

        // write prefix for optional fields
        const optional = Object.entries(value)
            // get optional defined fields
            .filter(([k, v]) => (k in this.spec.optional) && (v !== undefined))
            // extract keys
            .map(([k, _v]) => k)
            // sort by opt(n)
            .sort((a, b) => this.spec.optional[a][0] - this.spec.optional[b][0]);
        if(optional.length === 0)
            return;
        if(this.highPacking) {
            // high-packing mode
            const sel = new Uint8Array(this._hpSelLen);
            for(const k of optional) {
                const id = this.spec.optional[k][0];
                const [byte, bit] = [Math.floor(id / 8), 7 - (id % 8)];
                sel[byte] |= 1 << bit;
            }
            await stream.write(sel);
        } else {
            await new Int(1).write(stream, optional.length);
        }

        // write optional fields
        for(const k of optional) {
            if(value[k] === undefined)
                continue;
            if(!this.highPacking)
                await new Int(1).write(stream, this.spec.optional[k][0]);
            await this.spec.optional[k][1].write(stream, value[k]);
        }
    }

    override async read(stream: Readable): Promise<Value> {
        const value: Record<string, unknown> = {};

        // read required fields
        for(const k in this.spec.required) {
            const repr = this.spec.required[k];
            repr.specSpace = this.specSpace;
            value[k] = await repr.read(stream);
        }

        // read optional fields
        if(this.hasOptional) {
            if(this.highPacking) {
                const select = await stream.read(this._hpSelLen);
                for(let i = 0; i < this._hpSelLen * 8; i++) {
                    const [byte, bit] = [Math.floor(i / 8), 7 - (i % 8)];
                    if(select[byte] & (1 << bit)) {
                        const entry = Object.entries(this.spec.optional).find(x => x[1][0] == i);
                        if(!entry)
                            throw new Error(`Met field with unknown id "${i}" in high-packing mode`);

                        const repr = entry[1][1];
                        repr.specSpace = this.specSpace;
                        value[entry[0]] = await repr.read(stream);
                    }
                }
            } else {
                const int1 = new Int(1);
                const cnt = await int1.read(stream);
                for(let i = 0; i < cnt; i++) {
                    const id = await int1.read(stream);
                    const entry = Object.entries(this.spec.optional).find(x => x[1][0] == id);
                    if(!entry)
                        throw new Error(`Met field with unknown id "${id}" in normal mode`);

                    const repr = entry[1][1];
                    repr.specSpace = this.specSpace;
                    value[entry[0]] = await repr.read(stream);
                }
            }
        }

        return value as unknown as Value;
    }

    override findError(value: Value) {
        for(const k in value) {
            let repr: DataRepr<any>;

            if(k in this.spec.required)
                repr = this.spec.required[k];
            else
                repr = this.spec.optional[k][1];

            const error = repr.findError(value[k]);
            if(error)
                return `FieldArray.${k}: ${error}`;
        }

        return null;
    }
}

export class Entity extends DataRepr<ValuedEntity> {
    override async write(stream: Writable, value: ValuedEntity) {
        const array = new FieldArray(value.spec.fields);
        const [o, h] = array.chooseMode(value.value);
        const modeMask = (h ? 128 : 0) | (o ? 64 : 0);
        await new Int(1).write(stream, value.numericId | modeMask);
        await array.write(stream, value.value);
    }

    override async read(stream: Readable): Promise<ValuedEntity> {
        // read id
        let numericId = await new Int(1).read(stream);
        const mode: [boolean, boolean] = [(numericId & 64) > 0, (numericId & 128) > 0];
        numericId &= ~(128 | 64);

        if(!this.specSpace?.entities)
            throw new Error("No entity definitions provided");

        const entity = this.specSpace.entities[numericId].clone() as ValuedEntity;
        const array = new FieldArray(entity.spec.fields);
        array.setMode(mode);
        array.specSpace = this.specSpace;
        const value = await array.read(stream);
        entity.value = value;

        return entity;
    }

    override findError(value: ValuedEntity) {
        return new FieldArray(value.spec.fields).findError(value.value);
    }
}

export class EnumOrBf<T extends number> extends DataRepr<T> {
    private readonly int: Int;

    constructor(size: number) {
        super();
        this.int = new Int(size);
    }

    override async write(stream: Writable, value: T): Promise<void> {
        await this.int.write(stream, value);
    }

    override async read(stream: Readable): Promise<T> {
        return await this.int.read(stream) as T;
    }

    override findError(value: T) {
        const valid = (value >= 0) && (value < (1 << (8 * this.int.size)));
        return valid ? null : "Enum or Bitfield: value out of range";
    }
}
