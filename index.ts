import {
  ResultAsync,
  Result,
  ok,
  okAsync,
  err,
  errAsync,
  Ok,
  combine,
} from "neverthrow"

///////////////////////////////////////////////////////////////////////////////
//  Demo Functions
///////////////////////////////////////////////////////////////////////////////

// Internal function. May throw KnownError1. Shouldn't throw anything else.
const f1 = () => {
  return 1
}

// f1 modified to use neverthrow
const f1_n = (): Result<number, KnownError1> => {
  return ok(1)
}

// Internal function. May throw KnownError2. Shouldn't throw anything else.
const f2 = () => {
  return 2
}

// f2 modified to use neverthrow
const f2_n = (): Result<number, KnownError2> => {
  return ok(2)
}

// External function. Could throw anything.
const f3 = () => {
  return 3
}

// f3 modified to use neverthrow
const f3_n = (): Result<number, unknown> => {
  return ok(3)
}

// Internal function. May throw KnownError2. Shouldn't throw anything else.
const f4 = (a: number, b: number, c: number) => a + b + c

// f4 modified to use neverthrow
const f4_n = (a: number, b: number, c: number): Result<number, KnownError4> => {
  return ok(a + b + c)
}

// An asynchronous function
const asyncFn = async () => {
  return 1
}

///////////////////////////////////////////////////////////////////////////////
//  Main Example
///////////////////////////////////////////////////////////////////////////////

// A function with four steps and no error handling.
const noErrorHandling = (): number => {
  const result1 = f1()
  const result2 = f2()
  const result3 = f3()
  return f4(result1, result2, result3)
}

// Let's add error handling to this function
//
// Four scenarios
//  1. pass to caller
//  2. transform and pass to caller
//  3. recover or transform and pass to caller
//  4. combine intermediate results and pass errors to caller
// Three styles
//  - try/catch (imperative)
//  - neverthrow (functional)
//  - neverthrow (imperative)
// Goals: code should be
//  - type safe: types of variables and parameters are unambiguous and statically checked
//  - immutable: variables are const wherever possible
//  - clear: logic and control flow should be easy to follow
//  - concise: code should avoid superfluous detail
//  - easy to debug: use custom errors or stack traces to know where runtime errors occur

///////////////////////////////////////////////////////////////////////////////
//  Error Types
///////////////////////////////////////////////////////////////////////////////

class KnownError1 extends Error {}
class KnownError2 extends Error {
  get info(): string {
    return "info"
  }
}
class KnownError3 extends Error {
  get recover(): number {
    return 3
  }
}
class KnownError4 extends Error {}
class GenericKnownError extends Error {
  private _original: unknown
  // Could add a stack trace here
  constructor(message?: string, original?: unknown) {
    super(message)
    this._original = original
  }
  get original(): unknown {
    return this._original
  }
}

///////////////////////////////////////////////////////////////////////////////
//  Try/Catch (Imperative) Style
///////////////////////////////////////////////////////////////////////////////

// +/- Mostly type safe. Typescript catches use of uninitialized variables. Error types aren't easy to see.
// +/- Two variables mutable due to scoping constraints (can refactor to avoid)
// + Structure is clear
// +/- Least concise. Also, full type safety requires catch blocks to handle "impossible" error types.
// + Can be debugged as easily as any other option presented here.
const tryCatch = (): number => {
  //  1. pass to caller
  const result1 = f1() // Internal: only throws KnownError1

  //  2. transform and pass to caller
  let result2: number // Must declare mutable in this scope.
  try {
    result2 = f2() // Internal: only throws KnownError2
  } catch (e) {
    if (e instanceof KnownError2) {
      throw new KnownError1(e.info)
    } else {
      throw new GenericKnownError(`${e}`) // Unnecessary, but catches bugs
    }
  }

  //  3. recover or transform and pass to caller
  let result3: number // Must declare mutable in this scope.
  try {
    result3 = f3() // External: may throw unknown errors
  } catch (e) {
    if (e instanceof KnownError3) {
      result3 = e.recover
    } else {
      throw new GenericKnownError(`${e}`)
    }
  }

  //  4. combine intermediate results and pass errors to caller
  return f4(result1, result2, result3) // Internal: only throws KnownError4
}

///////////////////////////////////////////////////////////////////////////////
//  Neverthrow Utility functions
///////////////////////////////////////////////////////////////////////////////

// Convert error to result with known error type
const wrapErr: <T>(e: unknown) => Result<T, GenericKnownError> = (e) =>
  err(new GenericKnownError(`${e}`, e))

// Convert sync function call to neverthrow Result
const wrap: <Fn extends (...args: readonly any[]) => any>(
  f: Fn
) => (...args: Parameters<Fn>) => Result<ReturnType<Fn>, GenericKnownError> = (
  f
) => {
  return Result.fromThrowable(f, (e) => new GenericKnownError(`${e}`, e))
}

// Convert async function call to neverthrow Result
const wrapAsync: <T>(
  promise: Promise<T>
) => ResultAsync<T, GenericKnownError> = (promise) =>
  ResultAsync.fromPromise(promise, (e) => new GenericKnownError(`${e}`))

const createNeverthrowResults = async () => {
  let result: Result<number, GenericKnownError>

  // Convert value to neverthrow Result
  result = ok(1)

  // Convert error to neverthrow Result
  result = wrapErr("error")

  // Convert sync function to function returning Result<ReturnValue<typeof f1>, GenericKnownError>
  result = wrap(f1)()

  // Convert Promise to ResultAsync<ReturnValue<typeof f2>, GenericKnownError>
  result = await wrapAsync(asyncFn())

  return result
}

///////////////////////////////////////////////////////////////////////////////
//  Neverthrow (Functional) Style
///////////////////////////////////////////////////////////////////////////////

// + Type Safe. Error types are clear from Result type.
// + Most variables are immutable (function parameters aren't, but that's fixable)
// - Structure is harder to follow. Need special functions (mapErr, orElse, combine), and combining intermediate results requires serious back-flips if one function must complete before another begins (e.g. due to side-effects).
// + Most concise (comments expand the code in awkward ways, but normally you wouldn't need so many)
// + Can be debugged as easily as any other option presented here.
const neverthrowFunctional = (): Result<
  number,
  GenericKnownError | KnownError1 | KnownError4
> => {
  return combine([
    f1_n(), // 1. pass to caller (internal function)
    f2_n() // 2. transform and pass to caller
      .mapErr(
        (
          e // KnownError2
        ) => new KnownError1(e.info)
      ),
    wrap(f3)() // 3. recover or transform and pass to caller
      .orElse(
        (
          e // GenericKnownError
        ) =>
          e.original instanceof KnownError3 ? ok(e.original.recover) : err(e)
      ),
  ]).andThen(([result1, result2, result3]) =>
    // 4. combine intermediate results and pass errors to caller
    f4_n(result1, result2, result3)
  )
}

///////////////////////////////////////////////////////////////////////////////
//  Neverthrow (Imperative) Style
///////////////////////////////////////////////////////////////////////////////

// + Type Safe. Error types are clear from Result type.
// +/- One variable mutable due to scoping constraints (can refactor to avoid)
// + Structure is clear
// +/- Moderately concise (slightly better than try/catch, but must extract values and errors from results)
// + Can be debugged as easily as any other option presented here.
const neverthrowImperative = (): Result<
  number,
  GenericKnownError | KnownError1 | KnownError4
> => {
  // 1. pass to caller
  const result1 = f1_n() // Internal: Result<number,KnownError1>
  if (result1.isErr()) {
    return result1
  }

  // 2. transform and pass to caller
  const result2 = f2_n() // Internal: Result<number,KnownError2>
  if (result2.isErr()) {
    return err(new KnownError1(result2.error.info))
  }

  // 3. recover or transform and pass to caller
  // External: Result<number,GenericKnownError>
  let result3 = wrap(f3)() // Mutable.
  if (result3.isErr()) {
    if (result3.error instanceof KnownError3) {
      result3 = ok(result3.error.recover)
    } else {
      return wrapErr(result3.error)
    }
  }

  // 4. combine intermediate results and pass errors to caller
  // Internal: Result<number,KnownError4>
  return f4_n(result1.value, result2.value, result3.value)
}

///////////////////////////////////////////////////////////////////////////////
//  The bottom line
///////////////////////////////////////////////////////////////////////////////

// In a new project, I would use Neverthrow Imperative
//  - Error types are clear.
//  - Imperative structure is clear and easy to work with.
//  - A bit more concise than try/catch.
//  - Immutability is ok (can refactor to avoid problems)
// In an established project like Isomer, I would stick with try/catch
//  - Structure is clear and easy to work with.
//  - Immutability is ok (can refactor to avoid problems)
//  - Error types aren't annotated in function, and it's a bit verbose.
//  - The benefits of moving to another style don't justify the cost of doing so
// What's most important to me is that one style be used consistently within a project.

const main = () => {
  console.log("Done!")
}

main()
