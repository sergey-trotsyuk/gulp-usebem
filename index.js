'use strict';

var through = require('through2');
var path = require('path');
var vfs = require('vinyl-fs');
var gulpUtil = require('gulp-util');
var gulpIf = require('gulp-if');
var gulpConcat = require('gulp-concat');

var DEFAULT_COMMON_FILE_NAME = 'common';

/**
 * @param {String} html
 * @returns {Array}
 */
function findBlocks(html) {
  var classRe = new RegExp('class=(?:[\'"]([^\'"]+)|([^\\s>"\']+))', 'ig');
  var classSplitRe = new RegExp('\\s+');

  var possibleBlockClasses = [];
  var matches, classValue, classes;
  while (matches = classRe.exec(html)) {
    classValue = matches[1] || matches[2];
    classes = classValue.trim().split(classSplitRe);
    possibleBlockClasses = possibleBlockClasses.concat(classes.filter(function (v) {
      // Filter elements and modifiers
      return (v.indexOf('_') === -1);
    }));
  }

  return possibleBlockClasses;
}

/**
 * @param {Array.<String>} blockPaths
 * @param {Array.<String>} fileExts
 * @param {Array.<String>} blockClasses
 * @returns {Array.<String>}
 */
function findBlockGlobPaths(blockPaths, fileExts, blockClasses) {
  var blockFiles = [];
  blockClasses.forEach(function (blockClass) {
    blockPaths.forEach(function (blockPath) {
      //var globPath = blockPath + path.sep + blockClass + path.sep + '**/*';
      var globPath = blockPath + path.sep + blockClass + path.sep + blockClass;
      if (fileExts.length > 0) {
        fileExts.forEach(function (ext) {
          blockFiles.push(globPath + '.' + ext);
        });
      } else {
        blockFiles.push(globPath);
      }
    });
  });

  return blockFiles;
}

/**
 * @param {Array.<String>} blocks
 * @param {Object} opts
 * @returns {Array.<String>}
 */
function filterBlocks(blocks, opts) {
  return blocks.filter(function(block) {
    if (opts.commonAndUsualBlocks.indexOf(block) !== -1) {
      return true;
    }

    return (opts.commonBlocks.indexOf(block) === -1);
  });
}

/**
 * @param {Array.<String>} blocks
 * @param {Object} opts
 * @returns {Array.<String>}
 */
function filterJsBlocks(blocks, opts) {
  var filteredBlocks = filterBlocks(blocks, opts);

  if (opts.skipCommonAndUsualBlocksForJs) {
    // Remove common blocks from usual list
    filteredBlocks = filteredBlocks.filter(function (block) {
      return (opts.commonAndUsualBlocks.indexOf(block) === -1);
    });
  }

  return filteredBlocks;
}

function updateHtml(file, opts) {
  var html = file.contents.toString();
  var fileNameWithoutExt = file.path.substring(file.path.lastIndexOf(path.sep) + 1, file.path.lastIndexOf('.'));

  // CSS

  var cssFiles = [];
  if (opts.cssWithCommon) {
    cssFiles.push(
      opts.commonFileName + '.css'
    );
  }
  cssFiles.push(
    fileNameWithoutExt + '.css'
  );

  var links = [];
  cssFiles.forEach(function (cssFileName) {
    var cssUrl = opts.cssBlockPath + '/' + cssFileName;

    var linkParts = ['<link rel="stylesheet"', ' href="' + cssUrl + '"'];
    Object.keys(opts.cssLinkAttributes).forEach(function (attr) {
      linkParts.push(' ' + attr + '="' + opts.cssLinkAttributes[attr] + '"');
    });
    linkParts.push('>');

    links.push(linkParts.join(''));
  });

  html = html.replace(new RegExp('<!--\\s*' + opts.cssCommentMarker + '\\s*-->'), links.join("\n"));

  // JS

  var jsFiles = [];
  if (opts.jsWithCommon) {
    jsFiles.push(
      opts.commonFileName + '.js'
    );
  }
  jsFiles.push(
    fileNameWithoutExt + '.js'
  );

  var scripts = [];
  jsFiles.forEach(function (jsFileName) {
    var jsUrl = opts.jsBlockPath + '/' + jsFileName;
    var scriptParts = ['<script', ' src="' + jsUrl + '"'];
    Object.keys(opts.jsScriptAttributes).forEach(function (attr) {
      scriptParts.push(' ' + attr + '="' + opts.jsScriptAttributes[attr] + '"');
    });
    scriptParts.push('></script>');

    scripts.push(scriptParts.join(''));
  });

  html = html.replace(new RegExp('<!--\\s*' + opts.jsCommentMarker + '\\s*-->'), scripts.join("\n"));

  return html;
}

/**
 * @returns {Function}
 */
function usebem(opts) {
  opts.cssBlockPath = opts.cssBlockPath || '';
  opts.cssCommentMarker = opts.cssCommentMarker || 'block-css';
  opts.cssLinkAttributes = opts.cssLinkAttributes || {};
  opts.cssWithCommon = !!opts.cssWithCommon;
  opts.jsBlockPath = opts.jsBlockPath || '';
  opts.jsCommentMarker = opts.jsCommentMarker || 'block-js';
  opts.jsScriptAttributes = opts.jsScriptAttributes || {};
  opts.jsWithCommon = !!opts.jsWithCommon;
  opts.commonFileName = opts.commonFileName || DEFAULT_COMMON_FILE_NAME;

  return through.obj(function (file, enc, cb) {
    if (file.isNull()) {
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      cb(new gulpUtil.PluginError('gulp-usebem', 'Streaming not supported'));
      return;
    }

    var html = updateHtml(file, opts);

    try {
      file.contents = new Buffer(html);
      this.push(file);
    } catch (err) {
      this.emit('error', new gulpUtil.PluginError('gulp-usebem', err));
    }

    cb();
  });
}

/**
 * @param {Object} opts
 * @returns {Function}
 */
function assets(opts) {
  opts.blockPaths = opts.blockPaths || [];
  opts.exts = opts.exts || [];
  opts.extsJs = opts.extsJs || ['js'];
  opts.commonFiles = opts.commonFiles || [];
  opts.commonBlocks = opts.commonBlocks || [];
  opts.commonFileName = opts.commonFileName || DEFAULT_COMMON_FILE_NAME;
  opts.commonAndUsualBlocks = opts.commonAndUsualBlocks || [];
  opts.skipCommonAndUsualBlocksForJs = !!opts.skipCommonAndUsualBlocksForJs;

  var needAddCommon = true;

  var streams = Array.prototype.slice.call(arguments, 1);
  var restoreStream = through.obj();
  var unprocessed = 0;
  var end = false;

  var assetStream = through.obj(
    function (file, enc, cb) {
      // On "finish" handler
      var onFinish = (function () {
        if (--unprocessed === 0 && end) {
          this.emit('end');
        }
      }).bind(this);

      // If noconcat option is false, concat the files first.
      var concatCond = function (globPattern) {
        return opts.noconcat ? false : globPattern;
      };

      // Add common files
      if (needAddCommon) {
        needAddCommon = false;
        unprocessed++;

        var commonBlockGlobPaths = findBlockGlobPaths(opts.blockPaths, opts.exts, opts.commonBlocks);
        commonBlockGlobPaths = opts.commonFiles.concat(commonBlockGlobPaths);
        var commonConcatName = opts.commonFileName;

        var commonSrc = vfs.src(commonBlockGlobPaths, {
          base: file.base,
          nosort: true,
          nonull: true
        });

        // Add assets to the stream
        commonSrc
          .pipe(gulpIf(concatCond(new RegExp('\\.(?:css|scss)$')), gulpConcat(commonConcatName + '.scss')))
          .pipe(gulpIf(concatCond(new RegExp('\\.(?:css|less)$')), gulpConcat(commonConcatName + '.less')))
          .pipe(gulpIf(concatCond('*.js'), gulpConcat(commonConcatName + '.js')))
          .pipe(through.obj((function (newFile, enc, callback) {
            this.push(newFile);
            callback();
          }).bind(this)))
          .on('finish', onFinish);
      }

      var concatName = file.path.substring(file.path.lastIndexOf(path.sep) + 1, file.path.lastIndexOf('.'));

      // Find all blocks in HTML
      var blocks = findBlocks(file.contents.toString());

      // Remove common blocks from list
      blocks = filterBlocks(blocks, opts);

      // Get list of blocks for JS files
      var jsBlocks = filterJsBlocks(blocks, opts);

      // Get exts without JS exts
      var extsExceptJs = opts.exts.filter(function(ext) {
        return (opts.extsJs.indexOf(ext) === -1);
      });

      var blockGlobPathsExceptJs = findBlockGlobPaths(opts.blockPaths, extsExceptJs, blocks);
      var blockGlobPathsJs = findBlockGlobPaths(opts.blockPaths, opts.extsJs, jsBlocks);
      var blockGlobPaths = blockGlobPathsExceptJs.concat(blockGlobPathsJs);

      if (blockGlobPaths.length > 0) {
        unprocessed++;

        var src = vfs.src(blockGlobPaths, {
          base: file.base,
          nosort: true,
          nonull: true
        });

        // If any external streams were included, pipe all files to them first
        streams.forEach(function (stream) {
          src.pipe(stream);
        });

        // Add assets to the stream
        src
          .pipe(gulpIf(concatCond('*.scss'), gulpConcat(concatName + '.scss')))
          .pipe(gulpIf(concatCond('*.less'), gulpConcat(concatName + '.less')))
          .pipe(gulpIf(concatCond('*.css'), gulpConcat(concatName + '.css')))
          .pipe(gulpIf(concatCond('*.js'), gulpConcat(concatName + '.js')))
          .pipe(through.obj((function (newFile, enc, callback) {
            this.push(newFile);
            callback();
          }).bind(this)))
          .on('finish', onFinish);
      }

      restoreStream.write(file, cb);
    },
    function () {
      end = true;
      if (unprocessed === 0) {
        this.emit('end');
      }
    }
  );

  assetStream.restore = function () {
    return restoreStream.pipe(through.obj(), {end: false});
  };

  return assetStream;
}

// Exports

module.exports = usebem;
module.exports.assets = assets;
