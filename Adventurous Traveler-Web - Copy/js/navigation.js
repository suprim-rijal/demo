// Handle page transitions
document.addEventListener('DOMContentLoaded', function() {
    // Add fade-in animation to all pages
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});