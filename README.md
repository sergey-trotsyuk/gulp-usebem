# [gulp](https://github.com/gulpjs/gulp)-usebem

> Parse BEM block classes in HTML files to add style or script references.

Inspired by the gulp plugin [gulp-useref](https://github.com/jonkemp/gulp-useref).
Like gulp-useref this plugin only concatenate files but not optimize their.

## Install

Install with [npm](https://npmjs.org/package/gulp-usebem)

```
npm install --save-dev gulp-usebem
```


## Usage

The following example will parse the BEM block classes in the HTML and replace special markers to references.
Founded BEM files will be concatenated and passed through in a stream as well.

```js
var gulp = require('gulp'),
    usebem = require('gulp-usebem');

gulp.task('default', function () {
  var bemAssets = usebem.assets({
    blockPaths: ['app/blocks'],
    exts: ['css', 'js']
  });

  return gulp.src('app/*.html')
    .pipe($.usebem({
      cssCommentMarker: 'bem-css',
      cssBlockPath: 'styles/bem',
      jsCommentMarker: 'bem-js'
      jsBlockPath: 'scripts/bem',
    }))
    .pipe(gulp.dest('dist'));
});
```

Plugin parses CSS classes and try to find corresponding file:

```html
<!-- app/index.html -->
<html>
<head>
  <!-- bem-css -->
</head>
<body class="page">
  <header class="page__header"></header>
  <main class="page__container"></header>
  <footer class="page__footer"></footer>

  <!-- bem-js -->
</body>
</html>
```

CSS class "page" corresponding "app/blocks/page/page.css":

```css
/* app/blocks/page/page.css */

.page {}
.page__header {}
.page__container {}
.page__footer {}
```

and corresponding "app/blocks/page/page.js":

```js
/* app/blocks/page/page.js */

alert('"page" block JS!');
```

The resulting HTML would be:

```html
<!-- dist/index.html -->
<html>
<head>
  <link href="styles/bem/index.css" rel="stylesheet">
</head>
<body>
  <header class="page__header"></header>
  <main class="page__container"></header>
  <footer class="page__footer"></footer>
  <script type="text/javascript" src="scripts/one.js"></script>
</body>
</html>
```

The resulting CSS would be:

```css
/* dist/styles/bem/index.css */

.page {}
.page__header {}
.page__container {}
.page__footer {}

```

The resulting JS would be:

```js
/* dist/scripts/bem/index.js */

alert('"page" block JS!');
```

## License

MIT © Sergey Trotsyuk
