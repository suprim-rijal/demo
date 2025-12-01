document.addEventListener('DOMContentLoaded', function() {
    const welcomeSection = document.getElementById('welcome-section');
    const nameSection = document.getElementById('name-section');
    const storySection = document.getElementById('story-section');
    const nameInput = document.getElementById('player-name');
    const beginButton = document.getElementById('begin-btn');
    const nameError = document.getElementById('name-error');
    const continueButton = document.getElementById('continue-btn');
    const storyText = document.getElementById('story-text');
    
    let currentGameId = null;
    let playerName = '';
    
    // Auto transition from welcome to name entry
    setTimeout(() => {
        welcomeSection.classList.remove('active');
        setTimeout(() => {
            nameSection.classList.add('active');
            nameInput.focus();
        }, 800);
    }, 2000);
    
    // Handle name validation and game creation
    beginButton.addEventListener('click', async function(e) {
        e.preventDefault();
        
        const name = nameInput.value.trim();
        nameError.textContent = '';
        
        if (!name) {
            nameError.textContent = 'Please enter your name';
            shakeElement(nameInput);
            return;
        }
        
        if (name.length < 3) {
            nameError.textContent = 'Name must be at least 3 characters';
            shakeElement(nameInput);
            return;
        }
        
        playerName = name;
        beginButton.disabled = true;
        beginButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Game...';
        
        try {
            // Create new game
            const response = await fetch('/api/game/create', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    player_name: playerName 
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.game_id) {
                currentGameId = data.game_id;
                
                // Store in localStorage for persistence
                localStorage.setItem('currentGameId', currentGameId);
                localStorage.setItem('playerName', playerName);
                
                // Transition to story section
                nameSection.classList.remove('active');
                setTimeout(() => {
                    storySection.classList.add('active');
                    startStoryAnimation(playerName);
                }, 800);
                
            } else {
                nameError.textContent = data.error || 'Failed to create game';
                beginButton.disabled = false;
                beginButton.innerHTML = '<i class="fas fa-arrow-right"></i> Begin Journey';
            }
        } catch (error) {
            console.error('Error creating game:', error);
            nameError.textContent = 'Network error. Please try again.';
            beginButton.disabled = false;
            beginButton.innerHTML = '<i class="fas fa-arrow-right"></i> Begin Journey';
        }
    });
    
    // Enter key support for name input
    nameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            beginButton.click();
        }
    });
    
    // Continue to game
    continueButton.addEventListener('click', function() {
        if (currentGameId) {
            // Show loading state
            continueButton.disabled = true;
            continueButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading Game...';
            
            // Navigate to game with game_id in URL
            setTimeout(() => {
                window.location.href = `/game?game_id=${currentGameId}`;
            }, 500);
        } else {
            alert('Game not found. Please restart.');
            window.location.href = '/welcome';
        }
    });
    
    // Helper functions
    function shakeElement(element) {
        element.style.animation = 'none';
        element.offsetHeight; // Trigger reflow
        element.style.animation = 'shake 0.5s';
        
        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }
    
    function startStoryAnimation(playerName) {
        const storyLines = [
            `Welcome, ${playerName}.`,
            "You are about to embark on a great adventure across Europe.",
            "Your mission: Deliver 10 ancient artifacts to their designated airports.",
            "Start from a random European airport with limited fuel and money.",
            "Find artifacts and deliver them to earn rewards.",
            "But be careful! You only have 20 flights to complete your mission.",
            "Visit shops to buy fuel, upgrades, and helpful items.",
            "Random events may help or hinder your journey.",
            "Your adventure begins now. May fortune favor your travels!"
        ];
        
        let currentLine = 0;
        let currentChar = 0;
        const typingSpeed = 20;
        
        function typeWriter() {
            if (currentLine < storyLines.length) {
                const currentText = storyLines[currentLine];
                if (currentChar < currentText.length) {
                    let displayText = storyLines.slice(0, currentLine).join('<br>') + '<br>';
                    displayText += currentText.substring(0, currentChar + 1) + '<span class="cursor">|</span>';
                    storyText.innerHTML = displayText;
                    currentChar++;
                    setTimeout(typeWriter, typingSpeed);
                } else {
                    currentLine++;
                    currentChar = 0;
                    setTimeout(typeWriter, 800);
                }
            } else {
                // Finished typing
                storyText.innerHTML = storyLines.join('<br>');
                continueButton.classList.add('show');
            }
        }
        
        setTimeout(typeWriter, 500);
    }
});