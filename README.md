# Decoder

A powerful, well tested, type validator for Typescript.

## Credit

This library is essentially a rewrite of Nvie's (decoders.js)[https://github.com/nvie/decoders]
with some small changes. decoders.js is also inspired by Elm's decoders.

## Alternatives

- (Joi)[https://github.com/hapijs/joi]. The currently most popular validator for data.
  While it is useful for Javascript, it's Typescript support is lackluster as
  it has no way of ensuring that a validator actually adheres to a certain type.
  This means that on top of writing the validator, you will have to also manually
  write unit tests to ensure that your validator adheres to your type or interface.
  This creates way too much boilerplate, or relies on the developer to not make mistakes
  which defeats the purpose of having static types in the first place
- (decoders.js)[https://github.com/nvie/decoders]. This library is essentially a
  carbon copy with a few changes. For one, this library supports parsing literals
  and secondly this library features a dot syntax for operations such as `map`,
  `andThen`, which is more how it is conventionally used.

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
