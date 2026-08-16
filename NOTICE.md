# Notices

`cldr-person-names` is an AI-assisted implementation of Unicode LDML Part 8:
Person Names. Original contributions are copyright © 2026
cldr-person-names contributors.

The project is licensed under the Unicode License v3. See `LICENSE`.

## ICU-derived software

Portions of the following files were adapted from ICU4J release 77.1:

- `src/personName.ts` from `com.ibm.icu.text.SimplePersonName`;
- `src/pattern.ts` from `com.ibm.icu.impl.personname.PersonNamePattern` and
  `FieldModifierImpl`;
- `src/formatter.ts` and `src/scripts.ts` from
  `com.ibm.icu.impl.personname.PersonNameFormatterImpl`;
- `src/burmese.ts` from `com.ibm.icu.impl.breakiter.BurmeseBreakEngine` and
  `DictionaryBreakEngine.PossibleWord`.

The applicable upstream notices are:

> © 2022 and later: Unicode, Inc. and others.  
> License & terms of use: <https://www.unicode.org/copyright.html>

For the break-iterator sources:

> © 2016 and later: Unicode, Inc. and others.  
> License & terms of use: <https://www.unicode.org/copyright.html>
>
> Copyright (C) 2014, International Business Machines Corporation and
> others. All Rights Reserved.

Upstream source: <https://github.com/unicode-org/icu/tree/release-77-1>

## ICU data

`src/generated/burmese-dict.ts` contains the Burmese break-dictionary word
list from ICU release 77.1. Its source and copyright notice are retained in
that generated file.

## CLDR data

CLDR locale data is supplied by the package's `cldr-core` and
`cldr-person-names-full` runtime dependencies. It is not copied into this
repository or package. The CLDR person-name conformance data is downloaded
from the pinned CLDR release for testing and is not distributed with the
package.
