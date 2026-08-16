# cldr-person-names

JavaScript implementation of Unicode LDML Part 8: Person Names. Formats
structured personal names using CLDR person-name data. Currently targets
CLDR 48.2.

## Install

```sh
pnpm add cldr-person-names
```

## Use

```js
import { PersonNameFormatter } from 'cldr-person-names'

const formatter = new PersonNameFormatter({
  locale: 'en',
  length: 'medium',
  usage: 'referring',
  formality: 'formal'
})

const formatted = formatter.formatToString({
  locale: 'en',
  fields: {
    given: 'Ada',
    given2: 'King',
    surname: 'Lovelace'
  }
})

console.log(formatted)
// Ada K. Lovelace
```

Or, with the builder:

```js
const formatter = PersonNameFormatter.builder('en')
  .setLength('medium')
  .setUsage('referring')
  .setFormality('formal')
  .build()
```

| Option | Values |
| --- | --- |
| `locale` | A BCP 47 locale identifier |
| `length` | `long`, `medium`, `short`, `default` |
| `usage` | `referring`, `addressing`, `monogram` |
| `formality` | `formal`, `informal`, `default` |
| `displayOrder` | `default`, `sorting`, `givenFirst`, `surnameFirst` |
| `surnameFirstAllCaps` | `true` or `false` |

`locale` is the formatting locale: it selects the name-order rules. A name's
own locale is matched against those rules; it does not replace the formatting
locale.

Names may also provide modified fields such as `given-informal`,
`surname-prefix`, and `surname-core`, and a `preferredOrder`.

Names can also be read from a custom model, rather than copied into a `fields`
object. Any object with these three methods can be formatted:

```js
const name = {
  getNameLocale: () => 'en',
  getPreferredOrder: () => undefined,

  getFieldValue (field, modifiers) {
    if (field === 'given') {
      if (modifiers.delete('informal')) return 'Addie'
      return 'Ada'
    }
    if (field === 'surname') return 'Lovelace'
  }
}

new PersonNameFormatter({
  locale: 'en',
  formality: 'informal'
}).formatToString(name)
// Addie Lovelace
```

The formatter applies its own handling for any modifier left in the set, so the
object above still gets initials and monograms for free.

## Bundled use

The default Node.js entry loads CLDR data dynamically and includes
ICU-compatible Burmese segmentation. For browsers and bundled servers, use
`cldr-person-names/browser` or `cldr-person-names/browser/full`; these support
statically imported CLDR data and leave Burmese support opt-in through
`cldr-person-names/burmese`.

Browser support requires
[`Intl.Segmenter`](https://caniuse.com/?search=Intl.Segmenter).

The browser entry registers CLDR root person-name data and parent locales.
Register the formatting locales the application uses and provide likely
subtags for its formatting and name locales:

```js
import {
  PersonNameFormatter,
  registerData,
  registerLikelySubtags
} from 'cldr-person-names'
import likelySubtags from './person-name-likely-subtags.json'
import de from 'cldr-person-names-full/main/de/personNames.json'
import ja from 'cldr-person-names-full/main/ja/personNames.json'

// import 'cldr-person-names/burmese' // Optional ICU-compatible Burmese initials.

registerLikelySubtags(likelySubtags)
registerData(de, ja)

const formatter = new PersonNameFormatter({ locale: 'de' })
```

The package provides a consumer-side generator for producing a pinned subset
of CLDR likely-subtag data. Include every formatting locale and every locale
or script the application expects for names; use an `und-Script` value when
only the script is known:

```sh
pnpm exec cldr-person-names-extract-likely-subtags de ja und-Arab \
  > person-name-likely-subtags.json
```

Applications that cannot bound those locales and scripts can opt into the
complete likely-subtags table through the larger browser entry instead:

```js
import {
  PersonNameFormatter,
  registerData
} from 'cldr-person-names/browser/full'
import de from 'cldr-person-names-full/main/de/personNames.json'
import ja from 'cldr-person-names-full/main/ja/personNames.json'

registerData(de, ja)

const formatter = new PersonNameFormatter({ locale: 'de' })
```

To avoid global registration, create and supply a registry directly:

```js
import {
  createCldrDataRegistry,
  PersonNameFormatter
} from 'cldr-person-names'
import likelySubtags from './person-name-likely-subtags.json'
import de from 'cldr-person-names-full/main/de/personNames.json'
import ja from 'cldr-person-names-full/main/ja/personNames.json'

const dataProvider = createCldrDataRegistry({ likelySubtags })
dataProvider.addCldrJson(de)
dataProvider.addCldrJson(ja)

const formatter = new PersonNameFormatter({ locale: 'de', dataProvider })
```

Import from `cldr-person-names/core` for a fully manual, data-free entry point.
It performs no automatic CLDR imports or registration.

## API reference

Every export carries a doc comment in the published types.

## Development

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
```

Tests download the CLDR 48.2 person-name conformance data into the ignored
`test/data/` directory.

## License

Licensed under the [Unicode License v3](./LICENSE) (`Unicode-3.0`). See
[NOTICE.md](./NOTICE.md) for provenance, attribution, and authorship. Behavior
is based on [Unicode LDML Part 8: Person
Names](https://www.unicode.org/reports/tr35/tr35-personNames.html).
