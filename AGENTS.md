Refer to the project README for essential context.

## Git

After completing or updating any work that should be committed, include a suggested commit message in your reply
matching the commit conventions of the project.

Don't proactivley commit changes or amend existing commits unless explicitly requested.

## Tests

Test tricky domain logic such as date and recurrence behavior. Test tricky persistence logic such as decoding and
versioning. Add regression tests whenever a bug is found. Don't bother testing every UI detail or chasing coverage for
its own sake.

Prefer self-contained tests and tolerate modest setup duplication. Do not introduce test helpers solely to deduplicate
small amounts of setup.

## Documentation

Only write comments when prompted or when something is truly non-obvious or tricky. Keep documentation short and do not
clutter it with noise from work iterations and intermediate thoughts. Write in a way that is easy to understand for
future readers whom may have less context. Use simple sentences. Use plain language. Use concrete examples if something
is tricky to explain in the general.

## Code

Simplicity, uniformity, and elegance matter. Optimize for how easily someone can understand and change the code, rather
than line count. Model distinct domain concepts separately when they have different behavior or lifecycles. Prefer
dedicated types, operations, and UI components over combining them to share fields or markup. Prefer explicit names,
straightforward control flow, and named object shapes. Avoid compressing code into dense expressions or positional
tuples. Accept modest duplication when it keeps each operation easy to understand. Extract shared code conservatively
only when it represents a truly shared concept, rather than merely similar implementation. Split components around clear
responsibilities. Keep local naming for a given type or concept consistent with naming throughout the codebase.
