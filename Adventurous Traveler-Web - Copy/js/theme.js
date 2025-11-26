// Theme management
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeIcon(theme);
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-toggle svg');
    if (!icon) return;
    
    if (theme === 'dark') {
        icon.innerHTML = `<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>`;
    } else {
        icon.innerHTML = `<path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/>
        <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"/>`;
    }
}

// Initialize theme
document.addEventListener('DOMContentLoaded', () => {
    // Don't show theme toggle on welcome/story pages (they use a fixed look)
    const path = window.location.pathname || window.location.href;
    if (path.includes('welcome-name.html') || path.includes('story.html')) {
        // Still apply saved theme to other pages, but do not render the toggle here
        const savedTheme = localStorage.getItem('theme') || 'light';
        setTheme(savedTheme);
        return;
    }

    // Create and add theme toggle button
    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle theme');
    toggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"></svg>';
    document.body.appendChild(toggle);

    // Set initial theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);

    // Add click event
    toggle.addEventListener('click', toggleTheme);
});