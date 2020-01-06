[![Coverage Status](https://coveralls.io/repos/github/MarcCoquand/Decoder/badge.svg?branch=master)](https://coveralls.io/github/MarcCoquand/Decoder?branch=master)

# Decoder

A powerful, well tested, data decoder for Typescript.

See API Documentation for [Decoder](https://marccoquand.github.io/Decoder/classes/_decoder_.decoder.html)

## Install

Simply run

```
npm i elm-decoders
```

Or

```
yarn add elm-decoders
```

Then at the top of your file add:

```
import {Decoder} from 'elm-decoders'
```

## Table of Content

- [Decoder](#decoder)
  - [Install](#install)
  - [Motivation](#motivation)
  - [Tutorial](#tutorial)
  - [Credit](#credit)
  - [Alternatives](#alternatives)
  - [Local Development](#local-development)
    - [`npm start` or `yarn start`](#-npm-start--or--yarn-start-)
    - [`npm run build` or `yarn build`](#-npm-run-build--or--yarn-build-)
    - [`npm test` or `yarn test`](#-npm-test--or--yarn-test-)

## Motivation

Typescript is great, however it provides no tools for checking runtime data.
This means that we need a tool to check that incoming data follows the
correct typings. If we do not validate the data, errors can occur anywhere in
the code, introducing odd behaviors and tracking down where the error comes
from becomes difficult. By instead validating our data at the start (for
example when receiving an incoming request), we can handle the error early
and give better error messages to the developer. This creates a better
developer experience and gives us stronger guarantees that the code works
correctly.

Another benefit of using Decoders is that you can pick the best
data model for your problem and convert all incoming data sources to fit that
model. This makes it easier to write business logic separately from the
acquisition of the data.

Decoders are great for validating and converting data from various sources:
Kafka, request bodies or APIs to name a few examples.

For more motivation, see this [blog post](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)

## Tutorial

Decoder provides us with a few primitive decoders and a few methods to craft
new ones. Let's say we have the following data:

```
const incomingData: any = {
    name: "Nick",
    age: 30
}
```

And we have an interface `User`:

```
interface User {
    name: string
    age: number
}
```

To validate that `incomingData` is a `User`, Decoder provides an `object` primitive.

```
import {Decoder} from 'elm-decoders'

const userDecoder: Decoder<User> = Decoder.object({
    name: Decoder.string,
    age: Decoder.number
})
```

Now we can validate `incomingData` and ensure the data is correct.

```
const result = userDecoder.run(incomingData)
```

`run` returns a [Discriminated
union](https://www.typescriptlang.org/docs/handbook/advanced-types.html#discriminated-unions),
meaning is returns _either_ `{type: "OK", value: T}` _or_ `{type: "FAIL": error: string}`. This means that we are forced to check if the data received is correct or contains an error. Doing so
is as simple as a switch case:

```
switch(result.type) {
    case "OK":
        doUserThing(result.value)
    case "FAIL":
        handleError(result.error)
}
```

Decoder also provides a few methods for creating new decoders. For example, if
we want to create a set decoder, we can use the `map` method.

```
const intSetDecoder: Decoder<Set<number>> = Decoder.array(Decoder.number).map(numberArray => new Set(numberArray))
```

This was a brief introduction. From here, please check the API documentation
to find out more what you can do and try it for yourself!

## Credit

This library is essentially a rewrite of Nvie's [decoders.js](https://github.com/nvie/decoders)
with some small changes. decoders.js is inspired by Elm's decoders.

## Alternatives

- [Joi](https://github.com/hapijs/joi). The currently most popular validator for data.
  While it is useful for Javascript, it's Typescript support is lackluster as
  it has no way of ensuring that a validator actually adheres to a certain type.
  This means that on top of writing the validator, you will have to also manually
  write unit tests to ensure that your validator adheres to your type or interface.
  This creates way too much boilerplate or relies on the developer to not make mistakes.
  See also this [blog post](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/).
- [decoders.js](https://github.com/nvie/decoders). Features a different syntax but
  has a similar goal. It also contains two more dependencies compared to this library
  which has none.

## Local Development

Below is a list of commands you will probably find useful.

### `npm start` or `yarn start`

Runs the project in development/watch mode. Your project will be rebuilt upon changes. TSDX has a special logger for you convenience. Error messages are pretty printed and formatted for compatibility VS Code's Problems tab.

<img src="https://user-images.githubusercontent.com/4060187/52168303-574d3a00-26f6-11e9-9f3b-71dbec9ebfcb.gif" width="600" />

Your library will be rebuilt if you make edits.

### `npm run build` or `yarn build`

Bundles the package to the `dist` folder.
The package is optimized and bundled with Rollup into multiple formats (CommonJS, UMD, and ES Module).

<img src="https://user-images.githubusercontent.com/4060187/52168322-a98e5b00-26f6-11e9-8cf6-222d716b75ef.gif" width="600" />

### `npm test` or `yarn test`

Runs the test watcher (Jest) in an interactive mode.
By default, runs tests related to files changed since the last commit.
