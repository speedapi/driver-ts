// The nice server-side API

import { NotNull } from "./common";
import { FieldArray } from "./repr";
import { InvocationEvent, Session as SessionType } from "./session";
import { SpecSpace, AllMethods } from "./things";

type MethodByName<M extends AllMethods<SpecSpace>, N extends M["spec"]["name"]> =
    Extract<M, { spec: { name: N } }>;

export class Server<State, Session extends SessionType<SpecSpace>> {
    private session: Session;
    private state: State;
    private limiter: {
        [_ in AllMethods<Session["specSpace"]>["spec"]["name"]]?:
        number[]
    } = {};

    constructor(session: Session, initialState: State) {
        this.session = session;
        this.state = initialState;
    }

    onInvocation<M extends AllMethods<Session["specSpace"]>, N extends M["spec"]["name"]>(
        name: N,
        callback: (method: NotNull<MethodByName<M, N>, "params">, state: State) => Promise<State|void|undefined>
    ) {
        this.session.subscribe(async (ev) => {
            if(!(ev instanceof InvocationEvent))
                return;
            const method = ev.method as NotNull<MethodByName<M, N>, "params">;
            if(method.spec.name !== name)
                return;

            // check rate limit
            if(method.spec.rateLimit) {
                const [invocations, window] = method.spec.rateLimit;

                // rate-limited this method before
                if(name in this.limiter) {
                    const duringCurWindow = this.limiter[name]!.filter(x => Date.now() - x <= window);

                    if(duringCurWindow.length >= invocations) {
                        await method.error(65533, "rate limit exceeded");
                        this.limiter[name] = duringCurWindow;
                        return;
                    }

                    duringCurWindow.push(Date.now());
                    this.limiter[name] = duringCurWindow;
                } else {
                    this.limiter[name] = [Date.now()];
                }
            }

            // check validity
            if(!new FieldArray(method.spec.params).validate(method.params!)) {
                await method.error(65534, "validation failed");
                return;
            }

            const newState = await callback(method, this.state);
            if(newState !== undefined)
                this.state = newState;
        });
    }
}