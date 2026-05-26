import fs from 'fs';

try {
    // 1. Fix public/app.js (remove hint)
    let appJs = fs.readFileSync('public/app.js', 'latin1');
    appJs = appJs.replace(/<div class="login-user-hint"[^>]*>[\s\S]*?<\/div>/, '');
    fs.writeFileSync('public/app.js', appJs, 'latin1');
    console.log('Updated app.js');

    // 2. Fix public/src/index.css
    let indexCss = fs.readFileSync('public/src/index.css', 'utf8');

    // Increase logo width
    indexCss = indexCss.replace(
        /width:\s*clamp\(176px,\s*16vw,\s*264px\)\s*!important;/,
        'width: clamp(202px, 18.4vw, 304px) !important;'
    );

    // Fix fullscreen icon position
    indexCss = indexCss.replace(
        /top:\s*clamp\(32px,\s*5vh,\s*48px\)\s*!important; \/\* Horizontally aligned with logo! \*\/\r?\n\s*right:\s*clamp\(24px,\s*4vw,\s*56px\)\s*!important;/,
        'top: 24px !important;\n  right: 24px !important;'
    );
    
    // Fallback if the previous regex didn't perfectly match
    indexCss = indexCss.replace(
        /top:\s*clamp\(32px,\s*5vh,\s*48px\)\s*!important;[^\n]*\n\s*right:\s*clamp\(24px,\s*4vw,\s*56px\)\s*!important;/,
        'top: 24px !important;\n  right: 24px !important;'
    );

    fs.writeFileSync('public/src/index.css', indexCss, 'utf8');
    console.log('Updated index.css');
} catch (e) {
    console.error(e);
}
