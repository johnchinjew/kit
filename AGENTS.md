Refer to the project README for essential context.

## Git

After completing or updating any work that should be committed, include a suggested commit message in your reply
matching the commit conventions of the project. Don't proactivley commit changes or amend existing commits unless
explicitly requested.

## Elm

Use import `exposing` for types only, such as `import Html exposing (Html)`. Call functions through their qualified
module names, such as `Html.div`. If importing a multi-segment module prefer to alias the last segment, such as
`import Html.Attributes as Attributes`.

## Tests

Test tricky domain logic such as date and recurrence behavior. Test tricky persistence logic such as decoding and
versioning. Add regression tests whenever a bug is found. Don't bother testing every UI detail or chasing coverage for
its own sake. Prefer self-contained tests and tolerate modest setup duplication. Do not introduce test helpers solely to
deduplicate small amounts of setup.

## Documentation

Almost always avoid writing comments unless something is truly non-obvious or tricky. Keep documentation concise and do
not clutter it with noise from work iterations and intermediate thoughts. Write in a way that is easy to understand for
future readers whom may have less context. Use simple sentences. Use concrete examples if something is tricky to explain
in the general.
