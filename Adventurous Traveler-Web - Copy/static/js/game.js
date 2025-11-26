// Game State
let currentGame = null;
let currentArtifact = null;
let airports = [];
let shopItems = [];
let map;
let airportMarkers = {};

// API Base URL
const API_BASE = 'http://localhost:5000/api';

// Initialize Game
async function initGame() {
    await loadAirports();
    await loadShopItems();
    initializeMap();
}

// Start New Game
async function startGame() {
    try {
        const response = await fetch(`${API_BASE}/game/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ player_name: 'Adventurer' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentGame = data.game;
            currentArtifact = data.artifact;
            showScreen('game-screen');
            updateGameDisplay();
            updateMapMarkers();
            addEvent('Game started! Find and deliver 10 ancient artifacts across Europe. You have 20 flights.');
            updateCurrentArtifactInfo();
        } else {
            alert('Error starting game: ' + data.error);
        }
    } catch (error) {
        console.error('Error starting game:', error);
        alert('Failed to start game. Please check if the server is running.');
    }
}

// Refresh Game State
async function refreshGame() {
    if (!currentGame) return;
    
    try {
        const response = await fetch(`${API_BASE}/game/current`);
        const data = await response.json();
        
        if (data.success) {
            currentGame = data.game;
            currentArtifact = data.artifact;
            updateGameDisplay();
            updateEventsList(data.events);
            
            // Check game status
            if (currentGame.game_status === 'WON') {
                showWinScreen();
            } else if (currentGame.game_status === 'LOST') {
                showLoseScreen();
            }
        }
    } catch (error) {
        console.error('Error refreshing game:', error);
    }
}

// Load Airports
async function loadAirports() {
    try {
        const response = await fetch(`${API_BASE}/airports`);
        const data = await response.json();
        
        if (data.success) {
            airports = data.airports;
        }
    } catch (error) {
        console.error('Error loading airports:', error);
    }
}

// Load Shop Items
async function loadShopItems() {
    try {
        const response = await fetch(`${API_BASE}/shop-items`);
        const data = await response.json();
        
        if (data.success) {
            shopItems = data.items;
            renderShopItems('fuel');
        }
    } catch (error) {
        console.error('Error loading shop items:', error);
    }
}

// Initialize Map
function initializeMap() {
    map = L.map('map', {
        minZoom: 4,
        maxZoom: 8,
        maxBounds: [
            [35, -15],
            [65, 35]
        ]
    }).setView([48.8566, 2.3522], 5);

    // Green map theme
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 8
    }).addTo(map);
}

// Update Map Markers
function updateMapMarkers() {
    // Clear existing markers
    Object.values(airportMarkers).forEach(marker => {
        map.removeLayer(marker);
    });
    airportMarkers = {};

    // Add new markers
    airports.forEach(airport => {
        const isCurrent = currentGame && currentGame.current_airport_id === airport.id;
        const isArtifactLocation = currentArtifact && currentArtifact.delivery_airport_id === airport.id;
        
        let markerClass = `airport-marker ${airport.airport_size}`;
        if (isCurrent) markerClass += ' current';
        if (isArtifactLocation) markerClass += ' artifact';
        
        const marker = L.marker([airport.latitude, airport.longitude], {
            icon: L.divIcon({
                className: markerClass,
                html: '',
                iconSize: airport.airport_size === 'large' ? [20, 20] : [16, 16]
            })
        })
        .addTo(map)
        .bindPopup(createAirportPopup(airport));
        
        airportMarkers[airport.id] = marker;
        
        if (isCurrent) {
            map.setView([airport.latitude, airport.longitude], 6);
        }
    });
}

// Create Airport Popup
function createAirportPopup(airport) {
    const isCurrent = currentGame && currentGame.current_airport_id === airport.id;
    const isArtifactLocation = currentArtifact && currentArtifact.delivery_airport_id === airport.id;
    
    let popupContent = `
        <div style="min-width: 220px;">
            <h3 style="color: var(--accent-primary); margin-bottom: 10px;">${airport.name} (${airport.code})</h3>
            <p style="margin: 5px 0;"><strong>City:</strong> ${airport.city}</p>
            <p style="margin: 5px 0;"><strong>Country:</strong> ${airport.country}</p>
            <p style="margin: 5px 0;"><strong>Size:</strong> ${airport.airport_size.toUpperCase()}</p>
    `;
    
    if (isArtifactLocation) {
        popupContent += `<p style="margin: 10px 0; padding: 8px; background: #FFF3CD; border-radius: 4px; border-left: 4px solid #D9B44A;">
            <strong>🏺 Artifact Location!</strong><br>
            Deliver ${currentArtifact.name} here
        </p>`;
    }
    
    popupContent += `
            <button 
                style="width: 100%; padding: 10px; background: ${isCurrent ? '#718096' : '#0F5F3A'}; color: white; border: none; border-radius: 6px; margin-top: 10px; cursor: ${isCurrent ? 'not-allowed' : 'pointer'}; font-weight: 600;"
                onclick="${isCurrent ? '' : `travelTo(${airport.id})`}"
                ${isCurrent ? 'disabled' : ''}
            >
                ${isCurrent ? 'Current Location' : 'Travel Here'}
            </button>
        </div>
    `;
    
    return popupContent;
}

// Travel to Airport
async function travelTo(airportId) {
    if (!currentGame) return;
    
    try {
        const response = await fetch(`${API_BASE}/game/travel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ destination_airport_id: airportId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentGame = data.game;
            updateGameDisplay();
            updateMapMarkers();
            
            // Show travel results
            addEvent(`✈️ Flew ${data.distance}km to ${currentGame.airport_code}. Used ${data.fuel_cost.toFixed(0)}km fuel.`);
            
            // Show event if any
            if (data.event) {
                showEventPopup(data.event);
            }
            
            // Show delivery result if any
            if (data.delivery && data.delivery.delivered) {
                addEvent(`🎉 Delivered ${data.delivery.artifact_name}! Reward: $${data.delivery.reward_money} and ${data.delivery.reward_fuel}km fuel`);
                
                if (data.delivery.next_artifact) {
                    currentArtifact = data.delivery.next_artifact;
                    updateCurrentArtifactInfo();
                    addEvent(`🎯 New target: ${currentArtifact.name}. Find delivery location.`);
                } else {
                    // All artifacts delivered
                    showWinScreen();
                }
            }
            
            // Check game status
            if (currentGame.game_status === 'WON') {
                showWinScreen();
            } else if (currentGame.game_status === 'LOST') {
                showLoseScreen();
            }
        } else {
            alert('Travel failed: ' + data.error);
        }
    } catch (error) {
        console.error('Error traveling:', error);
        alert('Failed to travel. Please try again.');
    }
}

// Buy Item
async function buyItem(itemId) {
    if (!currentGame) return;
    
    try {
        const response = await fetch(`${API_BASE}/game/buy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ shop_item_id: itemId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentGame = data.game;
            updateGameDisplay();
            
            if (data.item.category === 'lootbox') {
                addEvent(`🎁 Opened ${data.item.name}! Found $${data.reward_money} and ${data.reward_fuel}km fuel`);
            } else {
                addEvent(`🛒 Purchased ${data.item.name} for $${data.item.price}`);
            }
            
            closeModal('shop-modal');
        } else {
            alert('Purchase failed: ' + data.error);
        }
    } catch (error) {
        console.error('Error purchasing item:', error);
        alert('Failed to purchase item.');
    }
}

// Update Game Display
function updateGameDisplay() {
    if (!currentGame) return;
    
    document.getElementById('money-display').textContent = `$${currentGame.money}`;
    document.getElementById('fuel-display').textContent = `${Math.floor(currentGame.fuel_km)} km`;
    document.getElementById('location-display').textContent = currentGame.airport_code;
    document.getElementById('artifacts-display').textContent = `${currentGame.artifacts_delivered}/10`;
    document.getElementById('flights-display').textContent = `${currentGame.flights_taken}/20`;
    
    // Update progress bars
    document.getElementById('artifact-progress').style.width = `${(currentGame.artifacts_delivered / 10) * 100}%`;
    document.getElementById('flight-progress').style.width = `${(currentGame.flights_taken / 20) * 100}%`;
    document.getElementById('artifact-count').textContent = `${currentGame.artifacts_delivered}/10`;
    document.getElementById('flight-count').textContent = `${currentGame.flights_taken}/20`;
    
    // Update status modal if open
    updateStatusDisplay();
}

// Update Status Display
function updateStatusDisplay() {
    if (!currentGame) return;
    
    const statusGrid = document.getElementById('status-grid');
    statusGrid.innerHTML = `
        <div class="status-item">
            <h4>Money</h4>
            <div class="status-value">$${currentGame.money}</div>
        </div>
        <div class="status-item">
            <h4>Fuel</h4>
            <div class="status-value">${Math.floor(currentGame.fuel_km)} km</div>
        </div>
        <div class="status-item">
            <h4>Max Fuel</h4>
            <div class="status-value">${currentGame.max_fuel_capacity} km</div>
        </div>
        <div class="status-item">
            <h4>Flights Taken</h4>
            <div class="status-value">${currentGame.flights_taken}/20</div>
        </div>
        <div class="status-item">
            <h4>Artifacts Delivered</h4>
            <div class="status-value">${currentGame.artifacts_delivered}/10</div>
        </div>
        <div class="status-item">
            <h4>Fuel Efficiency</h4>
            <div class="status-value">${currentGame.fuel_efficiency_bonus}%</div>
        </div>
        <div class="status-item">
            <h4>Flight Discount</h4>
            <div class="status-value">${currentGame.flight_discount_percent}%</div>
        </div>
        <div class="status-item">
            <h4>Current Location</h4>
            <div class="status-value">${currentGame.airport_code}</div>
        </div>
    `;
}

// Update Current Artifact Info
function updateCurrentArtifactInfo() {
    if (!currentArtifact) return;
    
    document.getElementById('current-artifact-name').textContent = currentArtifact.name;
    document.getElementById('current-artifact-location').textContent = `Delivery: ${currentArtifact.delivery_airport_name} (${currentArtifact.delivery_airport_code})`;
}

// Render Shop Items by Category
function renderShopItems(category) {
    const container = document.getElementById('shop-items-container');
    const filteredItems = shopItems.filter(item => {
        if (category === 'fuel') return item.category === 'fuel';
        if (category === 'upgrade') return item.category === 'upgrade';
        if (category === 'lootbox') return item.category === 'lootbox';
        return true;
    });
    
    container.innerHTML = '';
    
    filteredItems.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'shop-item';
        itemElement.onclick = () => buyItem(item.id);
        itemElement.innerHTML = `
            <i class="fas fa-${getItemIcon(item.category)}"></i>
            <h4>${item.name}</h4>
            <p>${item.description}</p>
            <div class="price">$${item.price}</div>
        `;
        container.appendChild(itemElement);
    });
}

// Show Shop Category
function showShopCategory(category) {
    // Update active category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    renderShopItems(category);
}

// Helper function for item icons
function getItemIcon(category) {
    const icons = {
        'fuel': 'gas-pump',
        'upgrade': 'tachometer-alt',
        'powerup': 'magic',
        'service': 'concierge-bell',
        'lootbox': 'gift'
    };
    return icons[category] || 'shopping-cart';
}

// Event Management
function addEvent(message) {
    const eventsList = document.getElementById('events-list');
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    eventItem.innerHTML = `
        <div class="event-time">${new Date().toLocaleTimeString()}</div>
        <div>${message}</div>
    `;
    eventsList.insertBefore(eventItem, eventsList.firstChild);
    
    // Keep only last 10 events
    while (eventsList.children.length > 10) {
        eventsList.removeChild(eventsList.lastChild);
    }
}

function updateEventsList(events) {
    const eventsList = document.getElementById('events-list');
    eventsList.innerHTML = '';
    
    events.forEach(event => {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-item';
        eventItem.innerHTML = `
            <div class="event-time">${new Date(event.created_at).toLocaleTimeString()}</div>
            <div>${event.description}</div>
        `;
        eventsList.appendChild(eventItem);
    });
}

function showEventPopup(event) {
    const popup = document.getElementById('event-popup');
    const title = document.getElementById('event-title');
    const message = document.getElementById('event-message');
    const effects = document.getElementById('event-effects');
    
    title.textContent = event.name;
    message.textContent = event.description;
    
    let effectsHtml = '';
    if (event.money_change > 0) {
        effectsHtml += `<div class="effect positive">+$${event.money_change}</div>`;
    } else if (event.money_change < 0) {
        effectsHtml += `<div class="effect negative">$${event.money_change}</div>`;
    }
    
    if (event.fuel_change > 0) {
        effectsHtml += `<div class="effect positive">+${event.fuel_change}km fuel</div>`;
    } else if (event.fuel_change < 0) {
        effectsHtml += `<div class="effect negative">${event.fuel_change}km fuel</div>`;
    }
    
    effects.innerHTML = effectsHtml;
    
    // Set popup class based on event category
    popup.className = 'event-popup active';
    if (event.category === 'positive' || event.category === 'lootbox') {
        popup.classList.add('positive');
    } else if (event.category === 'negative') {
        popup.classList.add('negative');
    }
}

function closeEventPopup() {
    document.getElementById('event-popup').classList.remove('active');
}

// Show Win Screen
async function showWinScreen() {
    if (!currentGame) return;
    
    try {
        const response = await fetch(`${API_BASE}/game/score`);
        const data = await response.json();
        
        if (data.success) {
            const score = data.score_breakdown;
            const breakdown = document.getElementById('win-score-breakdown');
            breakdown.innerHTML = `
                <div class="score-item">Base Score: <span>${score.base_score.toLocaleString()}</span></div>
                <div class="score-item positive">Artifacts (${currentGame.artifacts_delivered} × 5,000): <span>+${score.artifacts_bonus.toLocaleString()}</span></div>
                <div class="score-item positive">Money ($${currentGame.money} ÷ 10): <span>+${score.money_bonus.toLocaleString()}</span></div>
                <div class="score-item positive">Fuel (${Math.floor(currentGame.fuel_km)}km ÷ 5): <span>+${score.fuel_bonus.toLocaleString()}</span></div>
                <div class="score-item positive">Quests (${currentGame.artifacts_delivered} × 500): <span>+${score.quests_bonus.toLocaleString()}</span></div>
                <div class="score-item negative">Flights (${currentGame.flights_taken} × 20): <span>-${score.flights_penalty.toLocaleString()}</span></div>
                <div class="score-item positive">Speed Bonus: <span>+${score.speed_bonus.toLocaleString()}</span></div>
                <div class="score-total">Total Score: <span>${score.total_score.toLocaleString()}</span></div>
            `;
        }
    } catch (error) {
        console.error('Error loading score:', error);
    }
    
    showScreen('win-screen');
}

// Show Lose Screen
async function showLoseScreen() {
    if (!currentGame) return;
    
    document.getElementById('final-artifacts').textContent = currentGame.artifacts_delivered;
    
    try {
        const response = await fetch(`${API_BASE}/game/score`);
        const data = await response.json();
        
        if (data.success) {
            const score = data.score_breakdown;
            const breakdown = document.getElementById('lose-score-breakdown');
            breakdown.innerHTML = `
                <div class="score-item">Base Score: <span>${score.base_score.toLocaleString()}</span></div>
                <div class="score-item positive">Artifacts (${currentGame.artifacts_delivered} × 5,000): <span>+${score.artifacts_bonus.toLocaleString()}</span></div>
                <div class="score-item positive">Money ($${currentGame.money} ÷ 10): <span>+${score.money_bonus.toLocaleString()}</span></div>
                <div class="score-item positive">Fuel (${Math.floor(currentGame.fuel_km)}km ÷ 5): <span>+${score.fuel_bonus.toLocaleString()}</span></div>
                <div class="score-item positive">Quests (${currentGame.artifacts_delivered} × 500): <span>+${score.quests_bonus.toLocaleString()}</span></div>
                <div class="score-item negative">Flights (${currentGame.flights_taken} × 20): <span>-${score.flights_penalty.toLocaleString()}</span></div>
                <div class="score-item">Speed Bonus: <span>+${score.speed_bonus.toLocaleString()}</span></div>
                <div class="score-total">Total Score: <span>${score.total_score.toLocaleString()}</span></div>
            `;
        }
    } catch (error) {
        console.error('Error loading score:', error);
    }
    
    showScreen('lose-screen');
}

// Modal Functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    
    if (modalId === 'status-modal') {
        updateStatusDisplay();
    } else if (modalId === 'artifacts-modal') {
        renderArtifactsModal();
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Render Artifacts Modal
async function renderArtifactsModal() {
    if (!currentGame) return;
    
    const container = document.getElementById('artifacts-grid');
    container.innerHTML = '';
    
    try {
        // Load all artifacts
        const response = await fetch(`${API_BASE}/game/current`);
        const data = await response.json();
        
        if (data.success) {
            const artifacts = await getAllArtifacts();
            
            artifacts.forEach(artifact => {
                const isDelivered = artifact.artifact_order < currentGame.current_artifact_number;
                const isCurrent = artifact.artifact_order === currentGame.current_artifact_number;
                
                const card = document.createElement('div');
                card.className = `artifact-card ${isDelivered ? 'delivered' : ''}`;
                card.innerHTML = `
                    <i class="fas fa-${getArtifactIcon(artifact.artifact_order)}"></i>
                    <h4>${artifact.name}</h4>
                    <p>${artifact.description}</p>
                    <div class="status ${isDelivered ? 'delivered' : 'pending'}">
                        ${isDelivered ? '✓ Delivered' : isCurrent ? 'Current Target' : 'Not Found'}
                    </div>
                    ${isCurrent ? `<p><small>Deliver to: ${currentArtifact.delivery_airport_name}</small></p>` : ''}
                `;
                container.appendChild(card);
            });
        }
    } catch (error) {
        console.error('Error loading artifacts:', error);
    }
}

// Helper to get all artifacts
async function getAllArtifacts() {
    try {
        const response = await fetch(`${API_BASE}/artifacts`);
        const data = await response.json();
        return data.artifacts || [];
    } catch (error) {
        console.error('Error loading all artifacts:', error);
        return [];
    }
}

// Helper function for artifact icons
function getArtifactIcon(order) {
    const icons = ['crown', 'scroll', 'book', 'wine-glass-alt', 'ring', 
                  'mask', 'egg', 'bible', 'pen-fancy', 'gem'];
    return icons[order - 1] || 'question';
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.classList.remove('active');
    }
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initGame);