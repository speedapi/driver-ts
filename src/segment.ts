// Handles segment encoding and decoding

import * as common from "./common";
import * as things from "./things";
import { Entity as EntityRepr, FieldArray, Int, Str, DataRepr } from "./repr";
import { Session } from "./session";
import { Collector } from "./serial";

// A Segment, the smallest chunk of data in an API setting
// (as opposed to standalone [de]serialization mode)
export abstract class Segment {
    transactionId: number;
    abstract readonly boundTo: common.PeerType;

    constructor(tran: number) {
        this.transactionId = tran;
    }

    // Knowing the prefix and transaction bytes, decodes the rest of the segment
    static async decode(_session: Session, _stream: common.Readable, _prefix: number, _tran: number): Promise<Segment> {
        throw new Error("Not implemented");
    }

    // Decodes the prefix byte
    static decodePrefix(prefix: number): [boolean, boolean] {
        return [(prefix & 16) > 0, (prefix & 32) > 0];
    }

    // Encodes the meat of the segment (all except the transaction byte)
    async encode(_stream: common.Writable): Promise<void> {
        throw new Error("Not implemented");
    }

    // Writes the whole segment
    async write(stream: common.Writable) {
        const collector = new Collector();
        await collector.write(Uint8Array.from([this.transactionId]));
        await this.encode(collector);
        await stream.write(collector.data);
    }

    // Reads and decodes the whole segment
    static async read(session: Session, stream: common.Readable, boundTo: common.PeerType): Promise<Segment> {
        const [tran, prefix] = [...await stream.read(2)];
        const concreteClass = {
            "server": [
                InvokeMethodSegment,
                undefined,
                ConfResponseSegment,
                undefined,
            ],
            "client": [
                MethodReturnSegment,
                EntityUpdateSegment,
                ConfRequestSegment,
                MethodErrorSegment,
            ],
        }[boundTo][prefix >> 6];

        if(!concreteClass)
            throw new Error("Invalid segment number");
        return await concreteClass.decode(session, stream, prefix, tran);
    }
}

export class InvokeMethodSegment extends Segment {
    readonly boundTo = "server";
    payload: things.Method;

    constructor(tran: number, payload: things.Method) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, prefix: number, tran: number): Promise<InvokeMethodSegment> {
        // read IDs
        let [methodId] = await stream.read(1);
        let entityTypeId: number|undefined = undefined; // the signature of an entity type
        let entityId: any|undefined = undefined; // the ID used to reference an entity

        if(methodId & 0x80) { // highest bit set
            [entityTypeId] = await stream.read(1);
            methodId &= 0x7f;
            methodId |= ~entityTypeId & 0x80;
        }

        // get method template
        const methodSet = entityTypeId === undefined
            ? session.specSpace.globalMethods
            : session.specSpace.entities[entityTypeId & 0x7f].spec.methods;
        const method = methodSet[methodId].clone();

        // read entity id
        if(entityTypeId !== undefined && (entityTypeId & 0x80)) {
            const idType = method.spec.entityIdRepr as DataRepr<any>;
            entityId = await idType.read(stream);
        }

        // read fields
        const array = new FieldArray(method.spec.params);
        array.setMode(Segment.decodePrefix(prefix));
        array.specSpace = session.specSpace;
        const value = await array.read(stream);

        method.params = value;
        method.entityId = entityId;
        return new InvokeMethodSegment(tran, method);
    }

    override async encode(stream: common.Writable): Promise<void> {
        if(!this.payload.params)
            throw new Error("Null payload");

        // write prefix
        const array = new FieldArray(this.payload.spec.params);
        const [o, h] = array.chooseMode(this.payload.params);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (0 << 6) | modeMask;
        await stream.write(Uint8Array.from([prefix]));

        // write IDs
        let numId = this.payload.numericId;
        let entTypeId = this.payload.entityTypeId;
        const entId = this.payload.entityId;

        if(entTypeId !== undefined) {
            numId |= 0x80;
            if(entId !== undefined)
                entTypeId |= 0x80;
        }

        await stream.write(Uint8Array.from([numId]));
        if(entTypeId !== undefined)
            await stream.write(Uint8Array.from([entTypeId]));
        if(entId !== undefined)
            await (this.payload.spec.entityIdRepr as DataRepr<any>).write(stream, entId);

        // write fields
        await array.write(stream, this.payload.params);
    }
}

export class ConfResponseSegment extends Segment {
    readonly boundTo = "server";
    payload: things.Confirmation;

    constructor(tran: number, payload: things.Confirmation) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, prefix: number, tran: number): Promise<ConfResponseSegment> {
        // find spec
        const transaction = session.transactions.find(x => x.id == tran);
        if(!transaction)
            throw new Error("Unexpected CRSP segment");
        const conf = ([...transaction.segments].reverse()[0] as ConfRequestSegment).payload;

        // read fields
        const array = new FieldArray(conf.spec.response);
        array.setMode(Segment.decodePrefix(prefix));
        array.specSpace = session.specSpace;
        const value = await array.read(stream);

        conf.response = value;
        return new ConfResponseSegment(tran, conf);
    }

    override async encode(stream: common.Writable): Promise<void> {
        if(!this.payload.response)
            throw new Error("Null payload");

        // write prefix
        const array = new FieldArray(this.payload.spec.response);
        const [o, h] = array.chooseMode(this.payload.response);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (2 << 6) | modeMask;
        await stream.write(Uint8Array.from([prefix]));

        // write fields
        await array.write(stream, this.payload.response);
    }
}

export class MethodReturnSegment extends Segment {
    readonly boundTo = "client";
    payload: things.Method;

    constructor(tran: number, payload: things.Method) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, prefix: number, tran: number): Promise<MethodReturnSegment> {
        // find spec
        const transaction = session.transactions.find(x => x.id == tran);
        if(!transaction)
            throw new Error("Unexpected MRET segment");
        const method = (transaction.segments[0] as InvokeMethodSegment).payload.clone();
        method.params = undefined;

        // read fields
        const array = new FieldArray(method.spec.returns);
        array.specSpace = session.specSpace;
        array.setMode(Segment.decodePrefix(prefix));
        const value = await array.read(stream);

        method.returnVal = value;
        return new MethodReturnSegment(tran, method);
    }

    override async encode(stream: common.Writable): Promise<void> {
        if(!this.payload.returnVal)
            throw new Error("Null payload");

        // write prefix
        const array = new FieldArray(this.payload.spec.returns);
        const [o, h] = array.chooseMode(this.payload.returnVal);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (0 << 6) | modeMask;
        await stream.write(Uint8Array.from([prefix]));

        // write fields
        await array.write(stream, this.payload.returnVal);
    }
}

export class EntityUpdateSegment extends Segment {
    readonly boundTo = "client";
    payload: things.ValuedEntity;

    constructor(tran: number, payload: things.ValuedEntity) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, _prefix: number, tran: number): Promise<EntityUpdateSegment> {
        const repr = new EntityRepr();
        repr.specSpace = session.specSpace;
        const value = await repr.read(stream);
        return new EntityUpdateSegment(tran, value);
    }

    override async encode(stream: common.Writable): Promise<void> {
        await stream.write(Uint8Array.from([1 << 6]));
        const repr = new EntityRepr();
        repr.specSpace = {
            entities: { [this.payload.numericId]: this.payload as things.Entity },
            specVersion: "2",
            project: "$tmp!",
            globalMethods: {},
            confirmations: {},
        };
        await repr.write(stream, this.payload);
    }
}

export class ConfRequestSegment extends Segment {
    readonly boundTo = "client";
    payload: things.Confirmation;

    constructor(tran: number, payload: things.Confirmation) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(session: Session, stream: common.Readable, prefix: number, tran: number): Promise<ConfRequestSegment> {
        // the ID is in the prefix
        const numericId = prefix & 0x0F;
        const conf = session.specSpace.confirmations[numericId].clone();

        // read fields
        const array = new FieldArray(conf.spec.request);
        array.setMode(Segment.decodePrefix(prefix));
        const value = await array.read(stream);

        conf.request = value;
        return new ConfRequestSegment(tran, conf);
    }

    override async encode(stream: common.Writable): Promise<void> {
        if(!this.payload.request)
            throw new Error("Null payload");

        // write prefix
        const array = new FieldArray(this.payload.spec.request);
        const [o, h] = array.chooseMode(this.payload.request);
        const modeMask = (h ? 32 : 0) | (o ? 16 : 0);
        const prefix = (2 << 6) | modeMask | this.payload.numericId;
        await stream.write(Uint8Array.from([prefix]));

        // write fields
        await array.write(stream, this.payload.request);
    }
}

export class MethodErrorSegment extends Segment {
    readonly boundTo = "client";
    payload: { code: number, msg: string };

    constructor(tran: number, payload: { code: number, msg: string }) {
        super(tran);
        this.payload = payload;
    }

    static override async decode(_session: Session, stream: common.Readable, _prefix: number, tran: number): Promise<MethodErrorSegment> {
        const payload = await new FieldArray({
            required: { code: new Int(2), msg: new Str() },
            optional: { },
        }).read(stream);
        return new MethodErrorSegment(tran, payload);
    }

    override async encode(stream: common.Writable): Promise<void> {
        await stream.write(Uint8Array.from([3 << 6]));
        await new Int(2).write(stream, this.payload.code);
        await new Str().write(stream, this.payload.msg);
    }
}
