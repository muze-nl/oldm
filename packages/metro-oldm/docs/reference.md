---
title: 'Reference'
---
# @muze-nl/metro-oldm reference

```js
import oldmmw from '@muze-nl/metro-oldm'
```

## `oldmmw(options)`

```js
const api = client('https://pod.example/')
  .with(oldmmw({
    prefixes: {
      ldp: 'http://www.w3.org/ns/ldp#',
      schema: 'https://schema.org/'
    }
  }))
```

Adds Linked Data parsing and writing to a Metro client. Responses with Linked Data content types are parsed into OLDM data and stored on `response.data`. Request bodies that can be serialized by OLDM are converted before they are sent.

Common option: `prefixes`, passed through to OLDM.

See the OLDM package documentation for the data model and prefix behaviour.

Recognized Linked Data content types are `text/turtle`, `application/n-triples`, `application/n-quads`, `text/x-nquads` and `application/trig`.

### Errors

If a successful (`response.ok`) response claims a Linked Data content type but its body cannot be parsed, the request rejects. Calling code never receives a successful response whose `data` is unparsed text. An error response, such as a 404 or 500, whose body cannot be parsed is returned unchanged with the body text in `data`: its status already reports the failure.

If request data cannot be written, the request rejects before anything is sent. The default writer expects an OLDM `Graph`, not a plain object.

In both cases the error has:

- `cause`: the parser or writer error
- `request`: the Metro request
- `response`: the unparsed Metro response (parse errors only)

```js
try {
  const result = await api.get('foo.ttl')
} catch (error) {
  console.log(error.message, error.cause)
  if (error.response) {
    console.log(await error.response.text())
  }
}
```
