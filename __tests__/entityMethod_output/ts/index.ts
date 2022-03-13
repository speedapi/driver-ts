/* Generated by AMOGUS SUS (https://github.com/portasynthinca3/amogus)
 * Project name: entityMethod
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the “Software”), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as amogus from "../../../src/index";

// Represents connection states
export enum State {
	normal = 255,
}
export const State_SIZE = 1;


// Represents operation error codes
export enum ErrorCode {
	// Global method got invoked in an unsupported connection state
	invalid_state = 65535,
	// Field value validation failed
	validation_failed = 65534,
	// Rate limit got exceeded
	rate_limit = 65533,
	// Confirmation check failed
	confirmation_failed = 65532,
	// EntityGet failed (invalid ID)
	invalid_id = 65531,
	// EntityGet failed (failed to apply modifiers)
	invalid_get_modifier = 65530,
	// EntityUpdate failed
	invalid_entity = 65529,
}
export const ErrorCode_SIZE = 2;


const Test_StaticEchoSpec = {
	params: {
		required: {
			str: new amogus.repr.Str({}),
		},
		optional: {
		}
	},
	returns: {
		required: {
			str: new amogus.repr.Str({}),
		},
		optional: {
		}
	},
	confirmations: []
};
export class Test_StaticEcho extends amogus.Method<typeof Test_StaticEchoSpec> {
	constructor() {
		super(Test_StaticEchoSpec, 128, 0);
	}
}
const Test_DynamicEchoSpec = {
	params: {
		required: {
			str: new amogus.repr.Str({}),
		},
		optional: {
		}
	},
	returns: {
		required: {
			str: new amogus.repr.Str({}),
		},
		optional: {
		}
	},
	confirmations: []
};
export class Test_DynamicEcho extends amogus.Method<typeof Test_DynamicEchoSpec> {
	constructor() {
		super(Test_DynamicEchoSpec, 0, 0);
	}
}
const TestSpec = {
	fields: {
		required: {
			id: new amogus.repr.Int(8, {}),
		},
		optional: {
		}
	},
	methods: {
		128: new Test_StaticEcho(),
		0: new Test_DynamicEcho(),
	}
};
export class Test extends amogus.Entity<typeof TestSpec> {
	protected static readonly session?: amogus.session.Session;
	protected readonly dynSession?: amogus.session.Session;

	constructor(value?: amogus.FieldValue<typeof TestSpec["fields"]>) {
		super(TestSpec, 0, value);
	}

	static async staticEcho(
		params: amogus.FieldValue<typeof Test_StaticEchoSpec["params"]>,
		confirm?: amogus.session.ConfCallback<Test_StaticEcho>,
		session?: amogus.session.Session
	): Promise<amogus.FieldValue<typeof Test_StaticEchoSpec["returns"]>> {
		const method = new Test_StaticEcho();
		method.params = params;
		return await (session ?? this.session)!.invokeMethod(method, confirm);
	}

	async dynamicEcho(
		params: amogus.FieldValue<typeof Test_DynamicEchoSpec["params"]>,
		confirm?: amogus.session.ConfCallback<Test_DynamicEcho>,
		session?: amogus.session.Session
	): Promise<amogus.FieldValue<typeof Test_DynamicEchoSpec["returns"]>> {
		const method = new Test_DynamicEcho();
		method.params = params;
		if(!this.value) throw new Error("Entity must have a value");
		method.entityId = this.value.id;
		return await (session ?? this.dynSession)!.invokeMethod(method, confirm);
	}
}



export const $specSpace = {
	specVersion: 1,
	globalMethods: {
	},
	entities: {
		0: new Test(),
	},
	confirmations: {
	}
};



export function $bind(session: amogus.session.Session) {
	return {
		session,
		/*** METHODS ***/


		/*** ENTITIES ***/

		Test: class extends Test {
			protected readonly dynSession = session;
			protected static readonly session = session;
		},

		/*** ENUMS AND BITFIELDS ***/

		// Represents connection states
		State,
		// Represents operation error codes
		ErrorCode,
	};
}
