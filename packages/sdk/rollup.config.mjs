import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/lumino.js',
      format: 'iife',
      name: 'LuminoSDK',
      exports: 'named',
      footer: 'window.Lumino = LuminoSDK.Lumino || LuminoSDK.default;',
      sourcemap: true,
    },
    {
      file: 'dist/lumino.esm.js',
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    replace({
      preventAssignment: true,
      'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
    }),
    resolve({ browser: true }),
    commonjs(),
    typescript({ tsconfig: './tsconfig.build.json' }),
    production && terser(),
  ],
};
