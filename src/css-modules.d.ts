/**
 * CSS Modules typing for the plugin's own stylesheets. The build lowers each
 * `*.module.css` to a hashed local-name map (see tsdown.config.ts), so a
 * stylesheet's default export is a class map.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}
