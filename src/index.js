const path = require('path');

const Prerenderer = require('@prerenderer/prerenderer');
const SimpleRenderer = require('./simple-render');

const { minify } = require('html-minifier');

function WPRenderer(...args) {
  const rendererOptions = {};

  // get options
  this._options = args[0] || {};

  this._options.server = this._options.server || {};
  this._options.renderer = this._options.renderer || new SimpleRenderer(Object.assign({}, { headless: true }, rendererOptions));
}

WPRenderer.prototype.apply = function(compiler) {

  const compilerFS = compiler.outputFileSystem;

  const mkdirp = (dir, opts) => {
    return new Promise((resolve, reject) => {
      compilerFS.mkdirp(dir, opts, (err, made) => err === null ? resolve(made) : reject(err));
    });
  }

  const afterEmit = (compilation, done) => {
    const PrerendererInstance = new Prerenderer(this._options);

    PrerendererInstance.initialize()
      .then(() => {
        return PrerendererInstance.renderRoutes(this._options.routes || []);
      })
      // Run postProcess hooks.
      .then(renderedRoutes => this._options.postProcess
        ? Promise.all(renderedRoutes.map(renderedRoute => this._options.postProcess(renderedRoute)))
        : renderedRoutes
      )
      // Check to ensure postProcess hooks returned the renderedRoute object properly.
      .then(renderedRoutes => {
        const isValid = renderedRoutes.every(r => typeof r === 'object');

        if (!isValid) {
          throw new Error('[wp-renderer] Rendered routes are empty. Check `context` object in postProcess.');
        }

        return renderedRoutes;
      })
      // Minify html files if specified in config.
      .then(renderedRoutes => {
        if (!this._options.minify) {
          return renderedRoutes;
        }

        renderedRoutes.forEach(route => {
          route.html = minify(route.html, this._options.minify)
        });

        return renderedRoutes;
      })
      // Calculate outputPath if it hasn't been set already.
      .then(renderedRoutes => {
        renderedRoutes.forEach(rendered => {
          if (!rendered.outputPath) {
            rendered.outputPath = path.join(this._options.outputDir || this._options.staticDir, rendered.route, 'index.html');
          }
        })

        return renderedRoutes;
      })
      // Create dirs and write prerendered files.
      .then(processedRoutes => {
        const promises = Promise.all(processedRoutes.map(processedRoute => {
          return mkdirp(path.dirname(processedRoute.outputPath))
            .then(() => {
              return new Promise((resolve, reject) => {
                compilerFS.writeFile(processedRoute.outputPath, processedRoute.html.trim(), err => {
                  if (err) {
                    reject(`[wp-renderer] Unable to write rendered route to file "${processedRoute.outputPath}" \n ${err}.`);
                  } else {
                    resolve();
                  }
                });
              });
            })
            .catch(err => {
              if (typeof err === 'string') {
                err = `[wp-renderer] Unable to create directory ${path.dirname(processedRoute.outputPath)} for route ${processedRoute.route}. \n ${err}`;
              }

              throw err;
            });
        }));

        return promises;
      })
      .then(r => {
        PrerendererInstance.destroy();
        done();
      })
      .catch(err => {
        PrerendererInstance.destroy();
        const msg = '[wp-renderer] Unable to prerender all routes!';
        console.error(msg);
        compilation.errors.push(new Error(msg));
        done();
      });
  }

  if (compiler.hooks) {
    const plugin = { name: 'WPRenderer' };
    compiler.hooks.afterEmit.tapAsync(plugin, afterEmit);

  } else {
    compiler.plugin('after-emit', afterEmit);
  }
}

module.exports = WPRenderer;