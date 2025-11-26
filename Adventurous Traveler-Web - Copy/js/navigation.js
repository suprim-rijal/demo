// Handle page transitions and navigation
document.addEventListener('DOMContentLoaded', function() {
    // Add fade-in animation to all pages
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);

    // Handle navigation links
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.getAttribute('href') && !this.getAttribute('href').startsWith('#')) {
                e.preventDefault();
                const href = this.getAttribute('href');
                
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
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        const linkPage = link.getAttribute('href');
        if (linkPage === currentPage) {
            link.classList.add('active');
        }
    });
}

// Handle game start from index.html
function startGame() {
    document.body.style.opacity = '0';
    setTimeout(() => {
        window.location.href = 'welcome-name.html';
    }, 500);
}