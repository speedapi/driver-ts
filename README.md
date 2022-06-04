![License](https://img.shields.io/github/license/speedapi/driver-ts)
![Version](https://img.shields.io/npm/v/speedapi/driver)
![Coverage](https://coveralls.io/repos/github/speedapi/driver-ts/badge.svg?branch=master)
![Downloads](https://img.shields.io/npm/dt/speedapi/driver)
![Size](https://badgen.net/bundlephobia/minzip/speedapi/driver)
![PRs and issues](https://img.shields.io/badge/PRs%20and%20issues-welcome-brightgreen)

# SpeedAPI wire protocol implementation
This library provides a SpeedAPI implementation for JS and TS in all major environments (browser, node, etc.). Install it with:
```console
npm i @speedapi/driver
```
**If you're using a BigInt polyfill**, add this as close to the entry as possible:
```typescript
import * as speedapi from "@speedapi/driver";

// if using a polyfill that provides a BigInt(string, radix) constructor
// (e.g. 'big-integer', 'bigint-polyfill'):
speedapi.repr.BigInteger.polyfillMode = "radix";

// if using a polyfill that supports BigInt("0x<data>"):
speedapi.repr.BigInteger.polyfillMode = "0x";

// if not using a polyfill or using a polyfill that implements
// operators like native BigInts (haven't seen one of those in
// the wild):
speedapi.repr.BigInteger.polyfillMode = "none";
// OR don't do anything, this is the default value
```

# What is SpeedAPI?
It's a platform-agnostic API and serialization tool specifically geared towards high-throughput realtime applications. You can read more about its features [here](https://github.com/speedapi/info)

# How do I use it?
There's a complete tutorial over [here](https://github.com/speedapi/info/tree/master/speedapi-tutorial).

# Testing
**Warning**: this repository uses a `pnpm` lock file, hence you can't substitute it for `npm` below.
```
git clone https://github.com/speedapi/driver-ts
cd driver-ts
pnpm i
pip3 install susc
pnpm test
```
