import * as amogus from "../src/index";
import { createDummyLinks } from "../src/transport/universal";

describe("Field arrays", () => {
    const fieldSpec = {
        required: {
            foo: new amogus.repr.Int(1),
            bar: new amogus.repr.Str(),
        },
        optional: {
            baz: [0, new amogus.repr.Int(4)] as [number, amogus.repr.Int],
        }
    };


    test("Required fields only", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.FieldArray(fieldSpec);

        const values = [
            { foo: 10, bar: "hi" },
            { foo: 100, bar: "hello world" },
            { foo: 50, bar: "aboba" },
            { foo: 123, bar: "amogus" },
            { foo: 255, bar: "i like turtles" },
        ];

        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
        }
    });


    test("Required fields only + validation", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.FieldArray(fieldSpec);

        const values = [
            { foo: 60, bar: "hi" },
            { foo: 100, bar: "hello world" },
            { foo: 50, bar: "aboba" },
            { foo: 90, bar: "amogus" },
            { foo: 99, bar: "i like turtles" },
        ];

        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            expect(value).toEqual(val);
            expect(repr.validate(value)).toEqual(true);
        }
    });


    test("Required + optional fields (low-packing mode)", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.FieldArray(fieldSpec);
        repr.setMode([true, false]);

        const values = [
            { foo: 60, bar: "hi", baz: 1000 },
            { foo: 100, bar: "hello world", baz: 500 },
            { foo: 50, bar: "aboba", baz: 100500 },
            { foo: 90, bar: "amogus", baz: 69420 },
            { foo: 99, bar: "i like turtles", baz: 42069 },
        ];

        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);
            
            expect(value).toEqual(val);
            expect(repr.validate(value)).toEqual(true);
        }
    });

    test("Required + optional fields (high-packing mode)", async () => {
        const [a, b] = createDummyLinks();
        const repr = new amogus.repr.FieldArray(fieldSpec);
        repr.setMode([true, true]);

        const values = [
            { foo: 60, bar: "hi", baz: 1000 },
            { foo: 100, bar: "hello world", baz: 500 },
            { foo: 50, bar: "aboba", baz: 100500 },
            { foo: 90, bar: "amogus", baz: 69420 },
            { foo: 99, bar: "i like turtles", baz: 42069 },
        ];

        for(const val of values) {
            await repr.write(a, val);
            const value = await repr.read(b);

            expect(value).toEqual(val);
            expect(repr.validate(value)).toEqual(true);
        }
    });
});