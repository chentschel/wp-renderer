<h1 align="center">Webpack pre-renderer plugin</h1>
<p align="center">
  <em>Simple Webpack plugin for predendering HTML - Suitable for AWS lambda. Based on</em>
  Based on the https://github.com/chrisvfritz/prerender-spa-plugin by https://github.com/chrisvfritz.
</p>

---

### Basic Usage (`webpack.config.js`)
```js
const path = require('path')
const WRenderer = require('wp-plugin')

module.exports = {
  plugins: [
    ...
    new WRenderer({
      // Required - The path to the webpack-outputted app to prerender.
      staticDir: path.join(__dirname, 'dist'),
      // Required - Routes to render.
      routes: [ '/', '/some-route' ],
    })
  ]
}
