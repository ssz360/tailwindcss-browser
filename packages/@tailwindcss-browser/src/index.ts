import * as tailwindcss from 'tailwindcss'
import * as assets from './assets'
import { Instrumentation } from './instrumentation'

// Warn users about using the browser build in production as early as possible.
// It can take time for the script to do its work so this must be at the top.
console.warn(
  'The browser build of Tailwind CSS should not be used in production. To use Tailwind CSS in production, use the Tailwind CLI, Vite plugin, or PostCSS plugin: https://tailwindcss.com/docs/installation',
)

/**
 * The current Tailwind CSS compiler.
 *
 * This gets recreated:
 * - When stylesheets change
 */
let compiler: Awaited<ReturnType<typeof tailwindcss.compile>>


/**
 * Used for instrumenting the build process. This data shows up in the
 * performance tab of the browser's devtools.
 */
let I = new Instrumentation()

/**
 * Create the Tailwind CSS compiler
 *
 * This handles loading imports, plugins, configs, etc…
 *
 * This does **not** imply that the CSS is actually built. That happens in the
 * `build` function and is a separate scheduled task.
 */
async function createCompiler() {
  I.start(`Create compiler`)
  I.start('Reading Stylesheets')

  const css = `@import "tailwindcss";`

  I.start('Compile CSS')
  try {
    compiler = await tailwindcss.compile(css, {
      base: '/',
      loadStylesheet,
      loadModule,
    })
  } finally {
    I.end('Compile CSS')
    I.end(`Create compiler`)
  }
}

async function loadStylesheet(id: string, base: string) {
  function load() {
    if (id === 'tailwindcss') {
      return {
        path: 'virtual:tailwindcss/index.css',
        base,
        content: assets.css.index,
      }
    } else if (
      id === 'tailwindcss/preflight' ||
      id === 'tailwindcss/preflight.css' ||
      id === './preflight.css'
    ) {
      return {
        path: 'virtual:tailwindcss/preflight.css',
        base,
        content: assets.css.preflight,
      }
    } else if (
      id === 'tailwindcss/theme' ||
      id === 'tailwindcss/theme.css' ||
      id === './theme.css'
    ) {
      return {
        path: 'virtual:tailwindcss/theme.css',
        base,
        content: assets.css.theme,
      }
    } else if (
      id === 'tailwindcss/utilities' ||
      id === 'tailwindcss/utilities.css' ||
      id === './utilities.css'
    ) {
      return {
        path: 'virtual:tailwindcss/utilities.css',
        base,
        content: assets.css.utilities,
      }
    }

    throw new Error(`The browser build does not support @import for "${id}"`)
  }

  try {
    let sheet = load()

    I.hit(`Loaded stylesheet`, {
      id,
      base,
      size: sheet.content.length,
    })

    return sheet
  } catch (err) {
    I.hit(`Failed to load stylesheet`, {
      id,
      base,
      error: (err as Error).message ?? err,
    })

    throw err
  }
}

async function loadModule(): Promise<never> {
  throw new Error(`The browser build does not support plugins or config files.`)
}


async function rebuild(classes: Set<string>) {
  async function run() {

    if (!compiler) {
      await createCompiler()
    }

    I.start(`Build`)
    const result = compiler.build(Array.from(classes))
    I.end(`Build`)

    I.end(`Build`)

    return result ?? '';
  }

  try {
    return await Promise.resolve().then(run);;
  } catch (error) {
    I.error(error);
  }
}
export const tailwindCompiler = rebuild;

