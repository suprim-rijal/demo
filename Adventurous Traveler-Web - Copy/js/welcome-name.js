document.addEventListener('DOMContentLoaded', function() {
    const welcomeSection = document.getElementById('welcome-section');
    const nameSection = document.getElementById('name-section');
    const nameInput = document.getElementById('player-name');
    const beginButton = document.getElementById('begin-btn');
    const storySection = document.getElementById('story-section');
    const storyText = document.getElementById('story-text');
    const continueButton = document.getElementById('continue-btn');
    
    // Auto transition from welcome to name section after 3 seconds
    setTimeout(() => {
        welcomeSection.classList.remove('active');
        setTimeout(() => {
            nameSection.classList.add('active');
            nameInput.focus();
        }, 800);
    }, 3000);
    
    // Handle name submission: stay on same page and show story section
    if (beginButton) {
        beginButton.addEventListener('click', function() {
            const playerName = nameInput.value.trim();

            if (playerName) {
                // Save name to localStorage
                localStorage.setItem('playerName', playerName);

                // Transition: hide name section, show story section
                nameSection.classList.remove('active');
                setTimeout(() => {
                    if (storySection) {
                        storySection.classList.add('active');
                        // Start story typing using local story logic below
                        startStoryTyping(playerName);
                    }
                }, 500);
            } else {
                // Add shake animation to input
                nameInput.style.animation = 'shake 0.5s';
                nameInput.focus();

                // Remove animation after it completes
                setTimeout(() => {
                    nameInput.style.animation = '';
                }, 500);
            }
        });
    }
    
    // Allow Enter key to submit
    if (nameInput) {
        nameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                beginButton.click();
            }
        });
    }
});

// Add shake animation
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
`;
document.head.appendChild(style);

// Story typing logic (in-page) -------------------------------------------------
function startStoryTyping(playerName) {
    const storyTextEl = document.getElementById('story-text');
    const continueBtn = document.getElementById('continue-btn');
    if (!storyTextEl) return;

    const storyLines = [
        "Long ago, a mysterious artifact was lost among the skies...",
        "Known as the Sky Compass, it held the power to navigate between worlds.",
        "For centuries, brave travelers have searched for this legendary artifact...",
        `And now, ${playerName}, the time has come for your journey to begin.`,
        "Your mission awaits beyond the horizon. The skies call to you...",
        "Will you be the one to find the Sky Compass and restore balance to the realms?"
    ];

    let currentLine = 0;
    let currentChar = 0;
    const typingSpeed = 50;
    const lineDelay = 800;

    function typeWriter() {
        if (currentLine < storyLines.length) {
            const currentText = storyLines[currentLine];

            if (currentChar < currentText.length) {
                // Build the entire story up to current point
                let displayText = '';
                for (let i = 0; i < currentLine; i++) {
                    displayText += storyLines[i] + '<br>';
                }
                displayText += currentText.substring(0, currentChar + 1) + '<span class="cursor"></span>';

                storyTextEl.innerHTML = displayText;
                currentChar++;
                setTimeout(typeWriter, typingSpeed);
            } else {
                // Move to next line
                currentLine++;
                currentChar = 0;

                if (currentLine < storyLines.length) {
                    setTimeout(typeWriter, lineDelay);
                } else {
                    // Story complete
                    storyTextEl.innerHTML = storyLines.join('<br>');
                    if (continueBtn) continueBtn.classList.add('show');
                }
            }
        }
    }

    // Start typing animation after a short delay
    setTimeout(typeWriter, 600);

    // Continue button behavior
    if (continueBtn) {
        continueBtn.addEventListener('click', function() {
            document.body.style.opacity = '0';
            setTimeout(() => {
                alert('Your adventure continues! This would lead to the main game.');
            }, 500);
        });
    }
}