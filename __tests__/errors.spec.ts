import * as amogus from "../src/index";
import * as api from "./entity_output/ts/index";

describe("Library errors", () => {
    type Spec = ReturnType<typeof api.$specSpace>;
    const { client } = amogus.transport.universal.createDummyPair<Spec>(api.$specSpace);
    const session = api.$bind(client);

    test("call pushEntity() on the client", async () => {
        try {
            await client.pushEntity(new session.Test({ id: 123 }) as amogus.ValuedEntity);
        } catch(e) {
            expect((e as Error).message).toBe("pushEntity can only be called on the server");
        }
    });

    test("take all transaction slots", async () => {
        const method = new api.GlobalEcho();
        method.params = { str: "hello" };

        for(let i = 0; i < 256; i++) {
            try {
                await client.createTransaction(new amogus.segment.InvokeMethodSegment(0, method));
                expect(i).toBeLessThan(255);
            } catch(ex) {
                expect(i).toBe(255);
            }
        }
    });

    test("call return, confirm and error on unbound method", async () => {
        const method = new api.GlobalEcho();

        // really awkward formatting
        try { await method.error(0, ""); } catch(ex) {
            expect((ex as Error).message).toBe("No event to respond to");
        }
        try { await method.return({ str: "" }); } catch(ex) {
            expect((ex as Error).message).toBe("No event to respond to");
        }
        try { await method.confirm(new api.Silly(), { }); } catch(ex) {
            expect((ex as Error).message).toBe("No event to respond to");
        }
    });
});