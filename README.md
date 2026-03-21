# OLDM: Object Linked Data Mapper

OLDM has the same role as an ORM for SQL data, but for Linked Data instead. It turns triples into an object graph that you can just use in your javascript code.

The parse() method returns either the full graph or the specific subject requested:

```javascript
import oldm from '@muze-nl/oldm'

const context = oldm.context({
    prefixes: {
        'ldp':    'http://www.w3.org/ns/ldp#',
        'rdf':    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        'dct':    'http://purl.org/dc/terms/',
        'stat':   'http://www.w3.org/ns/posix/stat#',
        'turtle': 'http://www.w3.org/ns/iana/media-types/text/turtle#',
        'schem':  'https://schema.org/',
        'solid':  'http://www.w3.org/ns/solid/terms#',
        'acl':    'http://www.w3.org/ns/auth/acl#',
        'pims':   'http://www.w3.org/ns/pim/space#',
        'vcard':  'http://www.w3.org/2006/vcard/ns#',
        'foaf':   'http://xmlns.com/foaf/0.1/'
    },
    parser: oldm.n3Parser,
    writer: oldm.n3Writer
})

const url = 'https://auke.solidcommunity.net/profile/card#me'
const response = await fetch(url)
if (!response.ok) {
    throw new Error(response.status+':'+response.statusText)
}
const text = await response.text()
const source = context.parse(text, url, 'text/turtle')
const myProfile = source.primary
```

The `source.primary` is filled with the subject that matches the url exactly. `source.subjects` is an object with all subjects in the linked data source, as `id : subject`. `source.data` is a get function that returns an array with all subjects.

myProfile now looks like this (JSON stringified):
```json
{
    "vcard$bday":"1972-09-20",
    "vcard$fn":"Auke van Slooten",
    "vcard$hasEmail":[
        {
            "vcard$value":"mailto:auke@muze.nl"
        },
// etc...
```

Each subject has these non-enumerable properties as well:
- `id`: the full URI that identifies this subject
- `a`: one or more rdf:type values
- `graph`: refers back to the `source` which contains this subject

JSON-LD uses `@context` to translate json property names (keys) to linked data predicate URI's. OLDM instead doesn't translate predicate URI's at all, it just shortens them using the prefixes you define. So `http://www.w3.org/2006/vcard/ns#bday` becomes `vcard$bday`.

Subject and Object id's are never shortened. The `source.subjects` is an object with the full subject and object id's as key.

Predicate URI's are shortened by using the prefixes you defined in the options for the OLDM parser. They appear as `prefix$part` properties in the objects. You can switch this to appear as `prefix:part`, by setting the `separator` option to `":"` in the options for the parser. The reason the default is `$` is so that you can access predicates (properties) without using the ["..."] syntax. So you can type `object.vcard$bday` instead of `object["vcard:bday"]`.

Literal string and number values are converted into String and Number objects. If an xsd type is set on the literal, this is set as a `type` property on those objects. If a language is set on a string literal, this is set as a `language` property on the String object.

```javascript
const type = profile.vcard$bday.type
// returns 'xsd$date'
```

## Lists (Collections)

The turtle format support a short notation for ordered lists. OLDM translates that to a Collection class, that extends Array. You can create an ordered list like this:

```javascript
import oldm, {Collection} from '@muze-nl/oldm'

let coll = new Collection()
coll.push("A string")
```

## One or Many

Linked Data does not differentiate between one or more values for a predicate. In javascript you use either an Array for multiple values (or a Map, Set, etc.) or you use a single value string, number, object, etc. So on the javascript side of OLDM, you need to be able to specify what you want. OLDM provides two simple functions to help with that: `one()` and `many()`:

```javascript
import {one} from '@muze-nl/oldm'

const birthday = one(profile.vcard$bday)
const names = many(profile.vcard$fn)
```

## First non-empty value

Another issue is that there may be a number of different possible predicates that can describe the information you want. Or you may want to provide a default value in case none of those is present. OLDM provides the `first()` function for that:

```javascript
import {first} from '@muze-nl/oldm'

const name = first(profile.vcard$fn, profile.schema$givenName, 'John Doe')
```

The first value that is not null, undefined will be returned. If you want to make sure that any empty values will also be replaced with your default value, use this instead:

```
const name = first(profile.vcard$fn, profile.schema$givenName) ?? 'John Doe'
```
