const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const promiseLimit = require('promise-limit');

const waitForRender = function(options) {
  options = options || {};

  return new Promise((resolve, reject) => {
    // Render when an event fires on the document.
    if (options.renderAfterDocumentEvent) {
      if (
        window['__PRERENDER_STATUS'] &&
        window['__PRERENDER_STATUS'].__DOCUMENT_EVENT_RESOLVED
      ) {
        resolve();
      }

      document.addEventListener(options.renderAfterDocumentEvent, () => resolve());

    // Render after a certain number of milliseconds.
    } else if (options.renderAfterTime) {
      setTimeout(() => resolve(), options.renderAfterTime);

    // Default: Render immediately after page content loads.
    } else {
      resolve();
    }
  });
}

class SimpleRenderer {

  constructor(rendererOptions) {
    this._puppeteer = null;
    this._rendererOptions = rendererOptions || {};

    if (this._rendererOptions.maxConcurrentRoutes == null) {
      this._rendererOptions.maxConcurrentRoutes = 0;
    }

    if (this._rendererOptions.inject && !this._rendererOptions.injectProperty) {
      this._rendererOptions.injectProperty = '__PRERENDER_INJECTED';
    }
  }

  async initialize () {
    try {

      // wire chrome-aws
      this._rendererOptions.args = chrome.args;
      this._rendererOptions.headless = chrome.headless;
      this._rendererOptions.defaultViewport = chrome.defaultViewport,
      this._rendererOptions.executablePath = await chrome.executablePath;

      // This will try to use puppeteer or fallback to puppeteer-core
      // We included puppeteer as a dev dependency.
      this._puppeteer = await chrome.puppeteer.launch(this._rendererOptions);

    } catch (e) {
      console.error(e);
      console.error('[Prerenderer - PuppeteerRenderer] Unable to start Puppeteer');
    }

    return this._puppeteer;
  }

  async handleRequestInterception (page, baseURL) {
    await page.setRequestInterception(true);

    page.on('request', req => {

      // Skip third party requests if needed.
      if (this._rendererOptions.skipThirdPartyRequests) {
        if (!req.url().startsWith(baseURL)) {
          req.abort();
          return;
        }
      }

      req.continue();
    });
  }

  async renderRoutes (routes, Prerenderer) {
    const rootOptions = Prerenderer.getOptions();
    const options = this._rendererOptions;

    const limiter = promiseLimit(this._rendererOptions.maxConcurrentRoutes);

    const pagePromises = Promise.all(
      routes.map(
        (route, index) => limiter(
          async () => {
            const page = await this._puppeteer.newPage();

            if (options.consoleHandler) {
              page.on('console', message => options.consoleHandler(route, message));
            }

            if (options.inject) {
              await page.evaluateOnNewDocument(
                `(function () { window['${options.injectProperty}'] = ${JSON.stringify(options.inject)}; })();`
              );
            }

            const baseURL = `http://localhost:${rootOptions.server.port}`;

            // Allow setting viewport widths and such.
            if (options.viewport) {
              await page.setViewport(options.viewport);
            }

            await this.handleRequestInterception(page, baseURL);

            // Hack just in-case the document event fires before our main listener is added.
            if (options.renderAfterDocumentEvent) {
              page.evaluateOnNewDocument(function(options) {
                window['__PRERENDER_STATUS'] = {};

                document.addEventListener(options.renderAfterDocumentEvent, () => {
                  window['__PRERENDER_STATUS'].__DOCUMENT_EVENT_RESOLVED = true;
                });

              }, this._rendererOptions);
            }

            const navigationOptions = (options.navigationOptions) ?
              { waituntil: 'networkidle0', ...options.navigationOptions } : { waituntil: 'networkidle0' };

            await page.goto(`${baseURL}${route}`, navigationOptions);

            // Wait for some specific element exists
            const { renderAfterElementExists } = this._rendererOptions;

            if (
              renderAfterElementExists &&
              typeof renderAfterElementExists === 'string'
            ) {
              await page.waitForSelector(renderAfterElementExists);
            }

            // Once this completes, it's safe to capture the page contents.
            await page.evaluate(waitForRender, this._rendererOptions);

            const result = {
              originalRoute: route,
              route: await page.evaluate('window.location.pathname'),
              html: await page.content()
            };

            await page.close();

            return result;
          }
        )
      )
    )
    return pagePromises;
  }

  destroy () {
    this._puppeteer.close();
  }
}

module.exports = SimpleRenderer;
