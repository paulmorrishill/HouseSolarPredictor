# Low-Level Coding Best Practices
Follow these rules when writing code examples are given in C# terms but many apply to any language.

## Naming
- Use **descriptive variable and method names** that clearly convey intent  
- Avoid abbreviations or overly generic names like `data`, `temp`, or `value`

## Type Usage
- **Prefer `var`** when the type is obvious from the right-hand side  
- Use **explicit types** when the type is not immediately clear to the reader

## Constants and Literals
- **Avoid magic numbers and strings**  
- Use `const`, `readonly`, or `enum` values instead

## Control Flow
- Use **guard clauses** to reduce nesting and exit early  
- **Avoid `else` blocks**; return early or extract into separate methods  
- Keep **ternary expressions simple**; never nest or span multiple lines  
- Prefer **pattern matching** (`is`, `switch`, `when`) for clarity and conciseness  
- Avoid complex boolean expressions; extract into clearly named methods

## Methods and Properties
- Keep methods **short and focused** on a single responsibility  
- Use **expression-bodied members** for concise properties and methods  
- Avoid **side effects in property getters**  
- Keep **parameter lists short**; group parameters into objects when logical

## Collections
- **Never return or use `null` for collections**; prefer empty collections instead  
- **Avoid `if (items.Any()) foreach (...)`** – just `foreach` directly  
- Use **collection initializers** to simplify instantiation

## Immutability
- Use **`readonly` fields** for values set only in constructors  
- Prefer **immutable data structures** where practical

## Strings and Names
- Use **string interpolation** (`$"..."`) instead of `string.Format`  
- Use **`nameof()`** to avoid hardcoded strings for member names

## Exceptions
- **Avoid catching `Exception` directly**
- Catch **specific exceptions** and handle them appropriately
- You should not try to create 2 control flows through the system by "handling" an exception and then returning some imaginary default value. This just pushes the error further away from the source.
- Use runtime assertions (simple checks like if(value == null) throw new ArgumentException) instead of catching ONLY if something is actually possible to be null.

## Miscellaneous
- Avoid **flag-style booleans** for controlling logic; prefer enums or state objects  
- Use **object initializers** to improve readability and reduce boilerplate