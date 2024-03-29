import * as speedapi from "../src/index";
import { createDummyPair } from "../src/transport/universal";
import * as api from "./globalMethod_output/ts/index";

describe("Global method invocation", () => {
    let serverAskCaptcha = false;
    const { client, server } = createDummyPair(api.$specSpace);
    const clientSession = api.$bind(client);

    // server transaction listener
    server.subscribe(async (event) => {
        // only process echo() invocations
        if(!(event instanceof speedapi.InvocationEvent))
            return;
        const method = event.method;
        if(!(method instanceof api.Echo))
            return;

        if(serverAskCaptcha) {
            // ask captcha and compare solution
            const { code } = await method.confirm(new api.Captcha(), { url: "https://example.com/speedapi.png" });
            if(code === "speedapi")
                await method.return({ str: `${method.params.str} return` });
            else
                await method.error(api.ErrorCode.validation_failed, "Invalid captcha");
        } else {
            // send a response
            await method.return({ str: `${method.params.str} return` });
        }
    });


    test("normal return", async () => {
        serverAskCaptcha = false;
        const { str } = await clientSession.echo({ str: "Hello, World!" });
        expect(str).toEqual("Hello, World! return");
    });


    test("confirmation request", async () => {
        serverAskCaptcha = true;

        const { str } = await clientSession.echo({ str: "Hello, World!" }, async (conf) => {
            if(conf instanceof api.Captcha) {
                expect(conf.request!.url).toEqual("https://example.com/speedapi.png");
                return { code: "speedapi" };
            }
        });

        expect(str).toEqual("Hello, World! return");
    });


    test("confirmation request with no callback", async () => {
        try {
            serverAskCaptcha = true;
            await clientSession.echo({ str: "Hello, World!" });
            fail("Expected error");
        } catch(e) {
            expect((e as Error).message).toEqual("no confirmationCallback supplied but a ConfRequest segment was received");
        }
    });


    test("error return", async () => {
        serverAskCaptcha = true;

        try {
            await clientSession.echo({ str: "Hello, World!" }, async (conf) => {
                if(conf instanceof api.Captcha) {
                    expect(conf.request!.url).toEqual("https://example.com/speedapi.png");
                    return { code: "not speedapi" };
                }
            });
        } catch({ code, message }) {
            expect(code).toEqual(api.ErrorCode.validation_failed);
            expect(message).toEqual("Invalid captcha");
        }
    });
});
