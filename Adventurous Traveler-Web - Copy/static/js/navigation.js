// Handle page transitions and navigation
document.addEventListener('DOMContentLoaded', function() {
    // Add fade-in animation to all pages
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);

    // Handle navigation links - only for internal Flask routes
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Only handle internal navigation, not external links or # anchors
            if (href && !href.startsWith('http') && !href.startsWith('#') && 
                href !== 'javascript:void(0)') {
                e.preventDefault();
                
                document.body.style.opacity = '0';
                setTimeout(() => {
                    window.location.href = href;
                }, 500);
            }
        });
    });

    // Set active nav link based on current page
    setActiveNavLink();
});

function setActiveNavLink() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        const linkHref = link.getAttribute('href');
        
        // Handle Flask routes
        if (linkHref && currentPath.includes(linkHref.replace('/', ''))) {
            link.classList.add('active');
        }
        
        // Special case for home page
        if ((currentPath === '/' || currentPath.includes('index')) && 
            (linkHref === '/' || linkHref === '/index' || linkHref.includes('index'))) {
            link.classList.add('active');
        }
    });
}

// Utility function for smooth page transitions
function navigateTo(url) {
    document.body.style.opacity = '0';
    setTimeout(() => {
        window.location.href = url;
    }, 500);
}

// Handle browser back/forward buttons
window.addEventListener('pageshow', function(event) {
    // Re-apply fade-in when using browser navigation
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        document.body.style.opacity = '0';
        setTimeout(() => {
            document.body.style.opacity = '1';
        }, 100);
    }
});