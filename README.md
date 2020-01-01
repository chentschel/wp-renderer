<h1 align="center">Webpack renderer plugin</h1>
<p align="center">
  <em>Simple Webpack plugin for pre-rendering HTML - Suitable for AWS lambda. Based on</em>
  Based on the https://github.com/chrisvfritz/prerender-spa-plugin by https://github.com/chrisvfritz.
</p>

---

### Basic Usage (`webpack.config.js`)
```js
const path = require('path')
const WPRenderer = require('wp-renderer')

module.exports = {
  plugins: [
    ...
    new WPRenderer({
      // Required - The path to the webpack-outputted app to prerender.
      staticDir: path.join(__dirname, 'dist'),
      // Required - Routes to render.
      routes: [ '/', '/some-route' ],
    })
  ]
}
