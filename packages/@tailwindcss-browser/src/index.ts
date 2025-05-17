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
 * The list of all seen classes on the page so far. The compiler already has a
 * cache of classes but this lets us only pass new classes to `build(…)`.
 */
let classes = new Set<string>()

/**
 * The last input CSS that was compiled. If stylesheets "change" without
 * actually changing, we can avoid a full rebuild.
 */
let lastCss = ''


/**
 * The queue of build tasks that need to be run. This is used to ensure that we
 * don't run multiple builds concurrently.
 */
let buildQueue = Promise.resolve<string>('')

/**
 * What build this is
 */
let nextBuildId = 1

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
async function createCompiler(css: string) {
  I.start(`Create compiler`)
  I.start('Reading Stylesheets')


  // The user might have no stylesheets, or a some stylesheets without `@import`
  // because they want to customize their theme so we'll inject the main import
  // for them. However, if they start using `@import` we'll let them control
  // the build completely.
  if (!css.includes('@import')) {
    css = `@import "tailwindcss";${css}`
  }

  I.end('Reading Stylesheets', {
    size: css.length,
    changed: lastCss !== css,
  })

  // The input CSS did not change so the compiler does not need to be recreated
  if (lastCss === css) return

  lastCss = css

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

  classes.clear()
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

async function build() {
  if (!compiler) return

  // 1. Refresh the known list of classes
  let newClasses = new Set<string>()

  I.start(`Collect classes`)

  for (let element of document.querySelectorAll('[class]')) {
    for (let c of element.classList) {
      if (classes.has(c)) continue

      classes.add(c)
      newClasses.add(c)
    }
  }

  I.end(`Collect classes`, {
    count: newClasses.size,
  })

  // 2. Compile the CSS
  I.start(`Build utilities`)

  const result = compiler.build(Array.from(newClasses))

  I.end(`Build utilities`)

  return result;
}

async function rebuild(css: string) {
  async function run() {

    let buildId = nextBuildId++

    I.start(`Build #${buildId}`)

    await createCompiler(css)


    I.start(`Build`)
    const result = await build();
    I.end(`Build`)

    I.end(`Build #${buildId}`)

    return result ?? '';
  }

  try {
    buildQueue = buildQueue.then(run);
    return await buildQueue;
  } catch (error) {
    I.error(error);
  }
}
export const tailwindCompiler = rebuild;

