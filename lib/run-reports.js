/*
 Copyright 2012-2015, Yahoo Inc.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
var Reporter = require('./reporter'),
    fs = require('fs'),
    filesFor = require('./file-matcher').filesFor,
    libInstrument = require('istanbul-lib-instrument'),
    libCoverage = require('istanbul-lib-coverage'),
    libSourceMaps = require('istanbul-lib-source-maps'),
    hook = require('istanbul-lib-hook'),
    path = require('path');

function run(formats, config, opts, callback) {
    if (!callback && typeof(opts) === 'function') {
        callback = opts;
        opts = {};
    }
    opts = opts || {};
    var root,
        coverageMap = libCoverage.createCoverageMap(),
        sourceMapStore = libSourceMaps.createSourceMapStore({}),
        instrumenter,
        instOpts = config.instrumentation.getInstrumenterOpts(),
        includePattern = opts.include || '**/coverage*.raw.json',
        reporter = new Reporter(config),
        transformer,
        compiledExtensions = [];

    instOpts.sourceMapUrlCallback = function (file, url) {
        sourceMapStore.registerURL(file, url);
    };
    instrumenter = libInstrument.createInstrumenter(instOpts);
    transformer = function (code, file) {
        return instrumenter.instrumentSync(code, file);
    };
    opts.compilers.forEach(function (c) {
        var compiler = c.split(':'),
            ext = compiler[0],
            mod = compiler[1];

        if (mod[0] === '.') {
            mod = path.join(process.cwd(), mod);
        }
        compiledExtensions.push(ext);
        require(mod);
    });
    if (compiledExtensions.length) {
        var hookOpts = {
            verbose: config.verbose,
            extensions: config.instrumentation.extensions()
        };
        hook.hookRequire(function matchFn(filePath) {
            var ext = path.extname(filePath).substr(1);
            return (compiledExtensions.indexOf(ext) !== -1);
        }, transformer, hookOpts);
    }

    if (!formats || formats.length === 0) {
        formats = config.reporting.reports();
    }
    try {
        reporter.addAll(formats);
    } catch (ex) {
        ex.inputError = true;
        return callback(ex);
    }

    root = opts.root || process.cwd();
    filesFor({
        root: root,
        includes: [ includePattern ]
    }, function (err, files) {
        /* istanbul ignore if */
        if (err) {
            return callback(err);
        }
        files.forEach(function (file) {
            var coverageObject =  JSON.parse(fs.readFileSync(file, 'utf8'));
            coverageMap.merge(coverageObject);
        });
        if (compiledExtensions.length) {
            for (var filepath in coverageMap.data) {
                if (coverageMap.data.hasOwnProperty(filepath)) {
                    require(filepath);
                }
            }
        }
        var transformed = sourceMapStore.transformCoverage(coverageMap);
        reporter.write(transformed.map, {
            sourceFinder: transformed.sourceFinder
        });
        return callback();
    });
}

module.exports = {
    run: run
};


