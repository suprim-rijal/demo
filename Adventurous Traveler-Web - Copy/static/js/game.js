// Game State
let currentGame = null;
let currentArtifact = null;
let allArtifacts = [];
let airports = [];
let shopItems = [];
let map = null;
let airportMarkers = {};
let gameId = null;
let updateInterval = null;

const API_BASE = '/api';

// Initialize game
async function initGame() {
    try {
        // Get game ID from URL or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        gameId = urlParams.get('game_id') || localStorage.getItem('currentGameId');
        
        if (!gameId) {
            console.error('No game ID found');
            showErrorAndRedirect('No game found. Please start a new game.', '/welcome');
            return;
        }
        
        console.log('Initializing game with ID:', gameId);
        
        // Load static data
        await Promise.all([
            loadAirports(),
            loadShopItems()
        ]);
        
        // Initialize map
        initializeMap();
        
        // Load game state
        await loadGameState();
        
        // Start auto-update
        startAutoUpdate();
        
        // Add initial event
        addEvent('🎮 Game loaded successfully!');
        
    } catch (error) {
        console.error('Failed to initialize game:', error);
        addEvent('❌ Failed to load game. Please refresh.');
    }
}

// Load game state from server
async function loadGameState() {
    try {
        const response = await fetch(`${API_BASE}/game/current?game_id=${gameId}`);
        const data = await response.json();
        
        if (data.success) {
            currentGame = data.game;
            currentArtifact = data.current_artifact;
            allArtifacts = data.all_artifacts || [];
            
            // Update UI
            updateGameDisplay();
            updateMapMarkers();
            
            // Update logs
            if (data.logs && data.logs.length > 0) {
                updateLogs(data.logs);
            }
            
            // Check game status
            if (currentGame.game_status === 'WON') {
                showWinScreen();
                stopAutoUpdate();
            } else if (currentGame.game_status === 'LOST') {
                showLoseScreen();
                stopAutoUpdate();
            }
            
        } else {
            console.error('Failed to load game:', data.error);
            addEvent(`❌ Error: ${data.error}`);
            
            // If game not found, redirect to welcome
            if (data.error.includes('not found')) {
                localStorage.removeItem('currentGameId');
                showErrorAndRedirect('Game not found. Starting new game.', '/welcome');
            }
        }
    } catch (error) {
        console.error('Error loading game state:', error);
        addEvent('❌ Network error loading game.');
    }
}

// Travel to airport
async function travelTo(airportId) {
    if (!currentGame || currentGame.game_status !== 'ACTIVE') {
        addEvent('❌ Game is not active');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/game/travel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: gameId,
                destination_airport_id: airportId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentGame = data.game;
            updateGameDisplay();
            updateMapMarkers();
            
            addEvent(`✈️ Flew from ${currentGame.airport_code} to ${data.game.airport_code}. Distance: ${data.distance}km, Fuel used: ${Math.round(data.fuel_cost)}km`);
            
            // Handle events
            if (data.event) {
                showEventPopup(data.event);
            }
            
            // Handle delivery
            if (data.delivery && data.delivery.delivered) {
                addEvent(`🎉 ARTIFACT DELIVERED: ${data.delivery.artifact_name}! +$${data.delivery.reward_money} and +${data.delivery.reward_fuel}km fuel`);
                
                // Force reload to get next artifact
                setTimeout(() => loadGameState(), 1000);
            }
            
        } else {
            addEvent(`❌ Travel failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Travel error:', error);
        addEvent('❌ Network error during travel');
    }
}

// Buy shop item
async function buyItem(itemId) {
    try {
        const response = await fetch(`${API_BASE}/game/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_id: gameId,
                shop_item_id: itemId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentGame = data.game;
            updateGameDisplay();
            
            if (data.reward_money > 0) {
                addEvent(`🎁 LOOTBOX: Found $${data.reward_money} and ${data.reward_fuel}km fuel!`);
            } else {
                addEvent(`🛒 Purchased ${data.item.name} for $${data.item.price}`);
            }
            
            closeModal('shop-modal');
            
        } else {
            addEvent(`❌ Purchase failed: ${data.error}`);
        }
    } catch (error) {
        console.error('Purchase error:', error);
        addEvent('❌ Network error during purchase');
    }
}

// Load static data
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

async function loadShopItems() {
    try {
        const response = await fetch(`${API_BASE}/shop-items`);
        const data = await response.json();
        if (data.success) {
            shopItems = data.items;
        }
    } catch (error) {
        console.error('Error loading shop items:', error);
    }
}

// Initialize Leaflet map
function initializeMap() {
    map = L.map('map').setView([50, 10], 4);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    // Add custom styles
    const style = document.createElement('style');
    style.textContent = `
        .airport-marker {
            background: var(--accent-primary);
            border: 2px solid white;
            border-radius: 50%;
            width: 12px;
            height: 12px;
            cursor: pointer;
        }
        
        .airport-marker.current {
            background: var(--success-color);
            width: 16px;
            height: 16px;
            animation: pulse 2s infinite;
        }
        
        .airport-marker.artifact {
            background: var(--accent-tertiary);
            border-color: gold;
            box-shadow: 0 0 10px gold;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
}

// Update map markers
function updateMapMarkers() {
    if (!map || !currentGame) return;
    
    // Clear existing markers
    Object.values(airportMarkers).forEach(marker => map.removeLayer(marker));
    airportMarkers = {};
    
    // Find current artifact delivery airport
    let artifactAirportId = null;
    if (currentArtifact) {
        artifactAirportId = currentArtifact.delivery_airport_id;
    }
    
    // Add airport markers
    airports.forEach(airport => {
        const isCurrent = currentGame.current_airport_id === airport.id;
        const isArtifact = artifactAirportId === airport.id;
        
        // Create custom marker
        const marker = L.marker([airport.latitude, airport.longitude], {
            icon: L.divIcon({
                className: `airport-marker ${isCurrent ? 'current' : ''} ${isArtifact ? 'artifact' : ''}`,
                html: '',
                iconSize: [isCurrent ? 16 : 12, isCurrent ? 16 : 12]
            })
        }).addTo(map);
        
        // Create popup content
        let popupContent = `
            <div class="airport-popup" style="min-width: 200px;">
                <h3>${airport.name} (${airport.code})</h3>
                <p>${airport.city}, ${airport.country}</p>
                <p>✈️ ${airport.airport_size || 'International'} Airport</p>
        `;
        
        if (isCurrent) {
            popupContent += `<p><strong>📍 You are here</strong></p>`;
        } else if (isArtifact) {
            popupContent += `<p><strong>🌟 DELIVERY TARGET!</strong></p>`;
            popupContent += `<p>Deliver "${currentArtifact.artifact_name}" here</p>`;
        }
        
        if (!isCurrent && currentGame.game_status === 'ACTIVE') {
            // Calculate distance
            const distance = calculateDistance(
                currentGame.latitude,
                currentGame.longitude,
                airport.latitude,
                airport.longitude
            );
            
            const fuelNeeded = distance * (1 - currentGame.fuel_efficiency_bonus / 100);
            const canAfford = currentGame.fuel_km >= fuelNeeded;
            
            popupContent += `
                <p>📏 Distance: ${Math.round(distance)}km</p>
                <p>⛽ Fuel needed: ${Math.round(fuelNeeded)}km</p>
                <button onclick="travelTo(${airport.id})" 
                        ${!canAfford ? 'disabled' : ''}
                        class="travel-btn" style="
                            background: ${canAfford ? 'var(--accent-primary)' : '#ccc'};
                            color: white;
                            border: none;
                            padding: 5px 10px;
                            border-radius: 4px;
                            cursor: ${canAfford ? 'pointer' : 'not-allowed'};
                            width: 100%;
                            margin-top: 5px;
                        ">
                    ✈️ ${canAfford ? 'Fly Here' : 'Not Enough Fuel'}
                </button>
            `;
        }
        
        popupContent += `</div>`;
        
        marker.bindPopup(popupContent);
        airportMarkers[airport.id] = marker;
        
        // Center map on current location
        if (isCurrent) {
            map.setView([airport.latitude, airport.longitude], 6);
        }
    });
    
    // Add flight path to artifact if exists
    if (currentArtifact && currentArtifact.delivery_lat) {
        const currentAirport = airports.find(a => a.id === currentGame.current_airport_id);
        if (currentAirport) {
            const latlngs = [
                [currentAirport.latitude, currentAirport.longitude],
                [currentArtifact.delivery_lat, currentArtifact.delivery_lng]
            ];
            
            L.polyline(latlngs, {
                color: 'var(--accent-tertiary)',
                weight: 2,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(map);
        }
    }
}

// Update game display
function updateGameDisplay() {
    if (!currentGame) return;
    
    // Update stats
    document.getElementById('money-display').textContent = `$${currentGame.money.toLocaleString()}`;
    document.getElementById('fuel-display').textContent = `${Math.round(currentGame.fuel_km).toLocaleString()}km`;
    document.getElementById('location-display').textContent = currentGame.airport_code;
    document.getElementById('artifacts-display').textContent = `${currentGame.artifacts_delivered}/10`;
    document.getElementById('flights-display').textContent = `${currentGame.flights_taken}/20`;
    
    // Update progress bars
    const artifactPercent = (currentGame.artifacts_delivered / 10) * 100;
    const flightPercent = (currentGame.flights_taken / 20) * 100;
    
    const artifactBar = document.getElementById('artifact-progress');
    const flightBar = document.getElementById('flight-progress');
    
    if (artifactBar) artifactBar.style.width = `${artifactPercent}%`;
    if (flightBar) flightBar.style.width = `${flightPercent}%`;
    
    // Update progress text
    document.getElementById('artifact-count').textContent = `${currentGame.artifacts_delivered}/10`;
    document.getElementById('flight-count').textContent = `${currentGame.flights_taken}/20`;
    
    // Update artifact info
    updateCurrentArtifactInfo();
    
    // Update status modal if open
    updateStatusModal();
}

// Update current artifact info
function updateCurrentArtifactInfo() {
    const artifactName = document.getElementById('current-artifact-name');
    const artifactLocation = document.getElementById('current-artifact-location');
    
    if (currentArtifact) {
        if (artifactName) artifactName.textContent = currentArtifact.artifact_name;
        if (artifactLocation) artifactLocation.textContent = `Deliver to: ${currentArtifact.delivery_airport_name} (${currentArtifact.delivery_airport_code})`;
    } else {
        if (artifactName) artifactName.textContent = 'No current artifact';
        if (artifactLocation) artifactLocation.textContent = 'Game complete!';
    }
}

// Add event to log
function addEvent(message) {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;
    
    const eventItem = document.createElement('div');
    eventItem.className = 'event-item new';
    eventItem.innerHTML = `
        <div class="event-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        <div>${message}</div>
    `;
    
    eventsList.prepend(eventItem);
    
    // Limit to 10 events
    const events = eventsList.querySelectorAll('.event-item');
    if (events.length > 10) {
        events[events.length - 1].remove();
    }
    
    // Remove "new" class after animation
    setTimeout(() => {
        eventItem.classList.remove('new');
    }, 1000);
}

// Update logs from server
function updateLogs(logs) {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;
    
    // Clear existing events
    eventsList.innerHTML = '';
    
    // Add new events (most recent first)
    logs.slice().reverse().forEach(log => {
        const eventItem = document.createElement('div');
        eventItem.className = 'event-item';
        
        let message = log.description;
        if (log.money_change && log.money_change !== 0) {
            const sign = log.money_change > 0 ? '+' : '';
            message += ` (${sign}$${log.money_change})`;
        }
        if (log.fuel_change && log.fuel_change !== 0) {
            const sign = log.fuel_change > 0 ? '+' : '';
            message += ` (${sign}${log.fuel_change}km)`;
        }
        
        const time = new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        eventItem.innerHTML = `
            <div class="event-time">${time}</div>
            <div>${message}</div>
        `;
        
        eventsList.appendChild(eventItem);
    });
}

// Shop functions
function showShopCategory(category) {
    const container = document.getElementById('shop-items-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const filteredItems = shopItems.filter(item => item.category === category);
    
    if (filteredItems.length === 0) {
        container.innerHTML = '<p>No items in this category</p>';
        return;
    }
    
    filteredItems.forEach(item => {
        const canAfford = currentGame && currentGame.money >= item.price;
        
        const itemElement = document.createElement('div');
        itemElement.className = 'shop-item';
        itemElement.innerHTML = `
            <i class="fas ${getItemIcon(item.category)}"></i>
            <h4>${item.name}</h4>
            <p>${item.description}</p>
            <div class="price">$${item.price.toLocaleString()}</div>
            <button onclick="buyItem(${item.id})" 
                    ${!canAfford ? 'disabled' : ''}
                    class="${!canAfford ? 'disabled' : ''}">
                ${!canAfford ? 'Cannot Afford' : 'Buy Now'}
            </button>
        `;
        
        container.appendChild(itemElement);
    });
}

function getItemIcon(category) {
    switch(category) {
        case 'fuel': return 'fa-gas-pump';
        case 'upgrade': return 'fa-wrench';
        case 'lootbox': return 'fa-gift';
        case 'powerup': return 'fa-magic';
        case 'service': return 'fa-concierge-bell';
        default: return 'fa-shopping-cart';
    }
}

// Status modal
function updateStatusModal() {
    const statusGrid = document.getElementById('status-grid');
    if (!statusGrid || !currentGame) return;
    
    statusGrid.innerHTML = `
        <div class="status-item">
            <h4>Player Name</h4>
            <div class="status-value">${currentGame.player_name}</div>
        </div>
        <div class="status-item">
            <h4>Money</h4>
            <div class="status-value">$${currentGame.money.toLocaleString()}</div>
        </div>
        <div class="status-item">
            <h4>Fuel</h4>
            <div class="status-value ${currentGame.fuel_km < 1000 ? 'low' : ''}">
                ${Math.round(currentGame.fuel_km).toLocaleString()}km / ${currentGame.max_fuel_capacity.toLocaleString()}km
            </div>
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
            <div class="status-value">${currentGame.airport_code} - ${currentGame.city}, ${currentGame.country}</div>
        </div>
        <div class="status-item">
            <h4>Artifacts Delivered</h4>
            <div class="status-value">${currentGame.artifacts_delivered}/10</div>
        </div>
        <div class="status-item">
            <h4>Flights Taken</h4>
            <div class="status-value ${currentGame.flights_taken >= 15 ? 'low' : ''}">
                ${currentGame.flights_taken}/20
            </div>
        </div>
        <div class="status-item">
            <h4>Game Status</h4>
            <div class="status-value ${currentGame.game_status === 'ACTIVE' ? '' : 'low'}">
                ${currentGame.game_status}
            </div>
        </div>
    `;
}

// Artifacts modal
function showArtifactsModal() {
    const artifactsGrid = document.getElementById('artifacts-grid');
    if (!artifactsGrid || !allArtifacts) return;
    
    artifactsGrid.innerHTML = '';
    
    allArtifacts.forEach(artifact => {
        const isDelivered = artifact.is_delivered;
        const isCurrent = artifact.artifact_order === currentGame.current_artifact_number;
        
        const artifactElement = document.createElement('div');
        artifactElement.className = `artifact-card ${isDelivered ? 'delivered' : ''} ${isCurrent ? 'current' : ''}`;
        artifactElement.innerHTML = `
            <i class="fas ${isDelivered ? 'fa-check-circle' : 'fa-gem'}"></i>
            <h4>${artifact.artifact_name}</h4>
            <p>${artifact.artifact_description}</p>
            <p><strong>Deliver to:</strong> ${artifact.delivery_airport_name} (${artifact.delivery_airport_code})</p>
            <p><strong>Reward:</strong> +$${artifact.delivery_reward_money} +${artifact.delivery_reward_fuel}km</p>
            <div class="status ${isDelivered ? 'delivered' : isCurrent ? 'current' : 'pending'}">
                ${isDelivered ? 'Delivered' : isCurrent ? 'Current Target' : 'Pending'}
            </div>
        `;
        
        artifactsGrid.appendChild(artifactElement);
    });
}

// Event popup
function showEventPopup(event) {
    const popup = document.getElementById('event-popup');
    const title = document.getElementById('event-title');
    const message = document.getElementById('event-message');
    const effects = document.getElementById('event-effects');
    
    if (!popup || !title || !message || !effects) return;
    
    title.textContent = event.name;
    message.textContent = event.description;
    
    effects.innerHTML = '';
    
    if (event.money_change !== 0) {
        const effect = document.createElement('div');
        effect.className = `effect ${event.money_change > 0 ? 'positive' : 'negative'}`;
        effect.textContent = `${event.money_change > 0 ? '+' : ''}$${event.money_change}`;
        effects.appendChild(effect);
    }
    
    if (event.fuel_change !== 0) {
        const effect = document.createElement('div');
        effect.className = `effect ${event.fuel_change > 0 ? 'positive' : 'negative'}`;
        effect.textContent = `${event.fuel_change > 0 ? '+' : ''}${event.fuel_change}km`;
        effects.appendChild(effect);
    }
    
    popup.classList.add('active');
    if (event.category === 'positive' || (event.money_change >= 0 && event.fuel_change >= 0)) {
        popup.classList.add('positive');
        popup.classList.remove('negative');
    } else {
        popup.classList.add('negative');
        popup.classList.remove('positive');
    }
}

function closeEventPopup() {
    const popup = document.getElementById('event-popup');
    if (popup) {
        popup.classList.remove('active', 'positive', 'negative');
    }
}

// Win/Lose screens
function showWinScreen() {
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('win-screen').classList.add('active');
    
    const scoreBreakdown = document.getElementById('win-score-breakdown');
    if (scoreBreakdown && currentGame) {
        const artifactsScore = currentGame.artifacts_delivered * 1000;
        const moneyScore = currentGame.money;
        const fuelScore = Math.round(currentGame.fuel_km);
        const flightsPenalty = currentGame.flights_taken * 50;
        const totalScore = artifactsScore + moneyScore + fuelScore - flightsPenalty;
        
        scoreBreakdown.innerHTML = `
            <div class="score-item positive">
                <span>Artifacts Delivered (${currentGame.artifacts_delivered} × 1000):</span>
                <span>$${artifactsScore.toLocaleString()}</span>
            </div>
            <div class="score-item positive">
                <span>Money Remaining:</span>
                <span>$${moneyScore.toLocaleString()}</span>
            </div>
            <div class="score-item positive">
                <span>Fuel Remaining:</span>
                <span>$${fuelScore.toLocaleString()}</span>
            </div>
            <div class="score-item negative">
                <span>Flights Used (${currentGame.flights_taken} × 50):</span>
                <span>-$${flightsPenalty.toLocaleString()}</span>
            </div>
            <div class="score-total">
                <span>Total Score:</span>
                <span>$${totalScore.toLocaleString()}</span>
            </div>
        `;
    }
}

function showLoseScreen() {
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('lose-screen').classList.add('active');
    
    const finalArtifacts = document.getElementById('final-artifacts');
    if (finalArtifacts && currentGame) {
        finalArtifacts.textContent = currentGame.artifacts_delivered;
    }
    
    const scoreBreakdown = document.getElementById('lose-score-breakdown');
    if (scoreBreakdown && currentGame) {
        scoreBreakdown.innerHTML = `
            <div class="score-item">
                <span>Artifacts Delivered:</span>
                <span>${currentGame.artifacts_delivered}/10</span>
            </div>
            <div class="score-item">
                <span>Flights Used:</span>
                <span>${currentGame.flights_taken}/20</span>
            </div>
            <div class="score-item">
                <span>Money Remaining:</span>
                <span>$${currentGame.money.toLocaleString()}</span>
            </div>
            <div class="score-item">
                <span>Fuel Remaining:</span>
                <span>${Math.round(currentGame.fuel_km).toLocaleString()}km</span>
            </div>
            <div class="score-item">
                <span>Maximum Fuel Capacity:</span>
                <span>${currentGame.max_fuel_capacity.toLocaleString()}km</span>
            </div>
        `;
    }
}

// Helper functions
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function openModal(modalId) {
    if (modalId === 'artifacts-modal') {
        showArtifactsModal();
    } else if (modalId === 'shop-modal') {
        showShopCategory('fuel');
    } else if (modalId === 'status-modal') {
        updateStatusModal();
    }
    
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function refreshGame() {
    addEvent('🔄 Refreshing game state...');
    loadGameState();
}

function showErrorAndRedirect(message, url) {
    alert(message);
    window.location.href = url;
}

// Auto-update game state
function startAutoUpdate() {
    stopAutoUpdate();
    updateInterval = setInterval(() => {
        loadGameState();
    }, 30000); // Update every 30 seconds
}

function stopAutoUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', initGame);

// Clean up on page unload
window.addEventListener('beforeunload', stopAutoUpdate);