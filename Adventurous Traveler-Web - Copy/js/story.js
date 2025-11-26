document.addEventListener('DOMContentLoaded', function() {
    const storyText = document.getElementById('story-text');
    const continueButton = document.getElementById('continue-btn');
    const playerName = localStorage.getItem('playerName') || 'Adventurer';
    
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
    let typingSpeed = 50;
    let lineDelay = 1000;
    
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
                
                storyText.innerHTML = displayText;
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
                    storyText.innerHTML = storyLines.join('<br>');
                    continueButton.classList.add('show');
                }
            }
        }
    }
    
    // Start typing animation after a short delay
    setTimeout(typeWriter, 1000);
    
    // Continue button functionality
    if (continueButton) {
        continueButton.addEventListener('click', function() {
            document.body.style.opacity = '0';
            setTimeout(() => {
                alert('Your adventure continues! This would lead to the main game.');
                // window.location.href = 'game.html'; // For the actual game page
            }, 500);
        });
    }
});