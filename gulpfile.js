const fs             = require('fs');
const path           = require('path');
const glob           = require("glob");
const del            = require('del');
const gulp           = require('gulp');
const browserSync    = require('browser-sync');
const gulpif         = require('gulp-if');
const nunjucksRender = require('gulp-nunjucks-render');
const imagemin       = require('gulp-imagemin');
const plumber        = require('gulp-plumber');
const htmlbeautify   = require('gulp-html-beautify');
const htmlmin        = require('gulp-htmlmin');
const GulpMem        = require('gulp-mem');
const data           = require('gulp-data');
const notifier       = require('node-notifier');
const inlineCss      = require('gulp-inline-css');
const inject         = require('gulp-inject-string');
const sassToCSS      = require('gulp-sass');
const postcss        = require('gulp-postcss');
const autoprefixer   = require('autoprefixer');
const cssmqpacker    = require('css-mqpacker');
const mediaQueryText = require('mediaquery-text');
const isProduction   = process.argv.indexOf('--production') >= 0;
const upServer       = process.argv.indexOf('--server') >= 0;
const isWatching     = process.argv.indexOf('--watch') >= 0;


/* -----------------------------------------------------------------------------
 * Memory build config
 */

let gulpType;

if (upServer) {
    // gulpType = new GulpMem();
    // gulpType.serveBasePath = './dist';
    gulpType = gulp;
} else {
    gulpType = gulp;
}


/* -----------------------------------------------------------------------------
 * Functions
 */

// Delete dist folder
let cleanDist = function () {
    return del('./dist/**/*');
};


// Reload browser
let reloadBrowser = function () {
    return browserSync.reload();
};


// Get data for nunjucks
let getDataFromFiles = function() {
    let parsed = {};
    let pathsFiles = glob.sync("./src/data/**/*.json");
    let paths = [];

    pathsFiles.map((item) => {
        item = item.replace('./', '').replace('src', '');
        paths.push(item);
    });

    for(var i = 0; i < paths.length; i++) {
        var position = parsed;
        var split = paths[i].split('/');
        for(var j = 0; j < split.length; j++) {
            if(split[j] !== "") {
                if (split[j].includes('.json')) {
                    if (fs.readFileSync(path.join(__dirname, path.normalize('src/' + paths[i]))).length) {
                        try {
                            position[split[j].replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(__dirname, path.normalize('src/' + paths[i]))));
                        } catch(error) {
                            return console.error(error.toString()),
                            notifier.notify({
                                title: 'Error in console',
                                message: `${error.toString()}`,
                                sound: true,
                                wait: false
                            });
                        }
                    }
                } else {
                    if(typeof position[split[j]] === 'undefined') {
                        position[split[j]] = {};
                    }
                }
                position = position[split[j]];
            }
        }
    }

    return JSON.parse(JSON.stringify(parsed));
};


// Compile nunjucks to html
let nunjucks = function () {
    let manageEnvironment = function(environment) {
        environment.addGlobal('env', getDataFromFiles());
    };
    let css;

    // if (upServer) {
    //     css = gulpType.fs.data.dist.assets.css['app.css'].toString();
    // } else {
    //     css = fs.readFileSync('./dist/assets/css/app.css').toString();
    // }

    // Solo estilos mediaquery
    // cssFile = fs.readFileSync('./dist/assets/css/app.css').toString();
    // css = mediaQueryText(cssFile);

    css = fs.readFileSync('./dist/assets/css/app.css').toString();

    return gulp.src('./src/pages/**/*.{njk,htm,html}')
    .pipe(plumber())
    .pipe(data(getDataFromFiles()))
    .pipe(nunjucksRender({
        path: [
            './',
            './src'
        ],
        data: {
            root: '/'
        },
        manageEnv: manageEnvironment
    }).on('error', function (error) {
        return console.error(error.toString()),
        notifier.notify({
            title: 'Error in console',
            message: `${error.toString()}`,
            sound: true,
            wait: false
        });
    }))
    .pipe(inlineCss({
        url: 'file://' + __dirname + '/dist/',
        applyStyleTags: true,
        removeStyleTags: false,
        removeLinkTags: true,
        preserveMediaQueries: true
    }))
    .pipe(inject.before('</head>', '<style>'+css+'</style>'))
    .pipe(htmlmin({collapseWhitespace: true}))
    .pipe(htmlbeautify({
        preserve_newlines: false,
        max_preserve_newlines: 0,
        unformatted: [],
        editorconfig: true
    }))
    .pipe(gulpType.dest('./dist'))
    .pipe(browserSync.stream());
};


// Compile sass
let sass = function () {
    return gulp.src([
        './src/assets/scss/app.scss'
    ])
    .pipe(sassToCSS({
        //outputStyle: isProduction ? 'compressed' : 'expanded'
        outputStyle: 'compressed'
    }).on('error', function (sassToCSS) {
        console.log(sassToCSS.message);
        notifier.notify({
            title: 'Error in console',
            message: `${sassToCSS.messageOriginal}`,
            sound: true,
            wait: false
        });
    }))
    .pipe(postcss([
        autoprefixer({
            browsers: ['> 1%']
        }),
        cssmqpacker({
            sort: true
        })
    ]))
    .pipe(plumber())
    .pipe(gulpType.dest('./dist/assets/css'))
    .pipe(browserSync.stream());
};


// Move images to dist and optimize
let images = function () {
    return gulp.src('./src/assets/images/**/*.{gif,png,jpg,jpeg,svg}')
    .pipe(gulpif(isProduction || isWatching, imagemin({
        progressive: true
    })))
    .pipe(gulpType.dest('./dist/assets/images/'));
};


// Launch server
let server = function (done) {
    if (!isProduction && upServer) {
        browserSync.init({
            server: {
                baseDir: './dist/',
                serveStaticOptions: {
                    extensions: ["html"]
                }
            },
            middleware: gulpType.middleware,
        });
        done();
    }
};


// Launch watch
let watch = function () {
    if (isWatching) {
        gulp.watch([
            './src/layouts/**/*.{njk,htm,html}',
            './src/pages/**/*.{njk,htm,html}',
            './src/partials/**/*.{njk,htm,html}',
            './src/components/**/*.{njk,htm,html}',
            './src/data/**/*.json'
        ]).on('all', gulp.series(nunjucks, reloadBrowser));
        gulp.watch('./src/assets/scss/**/*.scss').on('all', gulp.series(sass, nunjucks, reloadBrowser));
        gulp.watch('./src/assets/images/**/*.{gif,png,jpg,jpeg,svg}').on('all', gulp.series(images, reloadBrowser));
    }
};


/* -----------------------------------------------------------------------------
 * Tasks
 */

gulp.task('build', gulp.series(cleanDist, sass, gulp.parallel(nunjucks, images)));
gulp.task('default', gulp.series('build', server, watch));