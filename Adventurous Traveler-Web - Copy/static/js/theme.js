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

// Check if current page should have theme toggle
function shouldShowThemeToggle() {
    const path = window.location.pathname.toLowerCase();
    
    // Pages that should NOT have theme toggle (immersive experience)
    const noTogglePages = ['/welcome', '/welcome-name', '/story'];
    
    return !noTogglePages.some(page => path.includes(page));
}

// Create theme toggle button
function createThemeToggle() {
    // Check if toggle already exists
    if (document.querySelector('.theme-toggle')) return;
    
    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle theme');
    toggle.setAttribute('title', 'Toggle light/dark theme');
    toggle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"></svg>';
    
    // Add click event
    toggle.addEventListener('click', toggleTheme);
    
    // Add to body
    document.body.appendChild(toggle);
}

// Initialize theme
document.addEventListener('DOMContentLoaded', () => {
    // Set initial theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    // Create theme toggle only on appropriate pages
    if (shouldShowThemeToggle()) {
        createThemeToggle();
    }
});

// Listen for theme changes from other tabs/windows
window.addEventListener('storage', function(e) {
    if (e.key === 'theme') {
        setTheme(e.newValue);
    }
});

// Export functions for use in other modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { setTheme, toggleTheme };
}