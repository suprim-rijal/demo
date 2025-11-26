from flask import Flask, jsonify, request, render_template, session, redirect, url_for
from flask_cors import CORS
import mysql.connector
import json
import random
from datetime import datetime
import math

app = Flask(__name__)
app.secret_key = 'adventurous_traveler_secret_key_2024'
CORS(app)

# Database configuration - USING YOUR CREDENTIALS
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'suprim123',
    'database': 'webadventurous_traveler'
}

def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)

# Routes for your existing pages
@app.route('/')
def welcome():
    return render_template('welcome.html')

@app.route('/start-game', methods=['POST'])
def start_game():
    player_name = request.form.get('player_name')
    if player_name:
        session['player_name'] = player_name
        return redirect(url_for('story'))
    return redirect(url_for('welcome'))

@app.route('/story')
def story():
    if 'player_name' not in session:
        return redirect(url_for('welcome'))
    return render_template('story.html', player_name=session['player_name'])

@app.route('/game')
def game_main():
    if 'player_name' not in session:
        return redirect(url_for('welcome'))
    return render_template('index.html', player_name=session['player_name'])

# API endpoints for main game
@app.route('/api/game/start', methods=['POST'])
def start_main_game():
    data = request.json
    player_name = data.get('player_name', session.get('player_name', 'Traveler'))
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Get a random starting airport (not the artifact delivery airport)
        cursor.execute("""
            SELECT id FROM airports 
            WHERE id NOT IN (SELECT delivery_airport_id FROM artifacts)
            ORDER BY RAND() LIMIT 1
        """)
        start_airport = cursor.fetchone()
        
        if not start_airport:
            return jsonify({'success': False, 'error': 'No valid starting airport found'})
        
        # Create new game
        cursor.execute("""
            INSERT INTO games (player_name, money, fuel_km, max_fuel_capacity, current_airport_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (player_name, 10000, 2500, 5000, start_airport['id']))
        
        game_id = cursor.lastrowid
        
        # Get game data
        cursor.execute("""
            SELECT g.*, a.code as airport_code, a.name as airport_name, 
                   a.city, a.country, a.latitude, a.longitude
            FROM games g 
            JOIN airports a ON g.current_airport_id = a.id 
            WHERE g.id = %s
        """, (game_id,))
        game = cursor.fetchone()
        
        # Get current artifact
        cursor.execute("""
            SELECT art.*, a.name as delivery_airport_name, a.code as delivery_airport_code,
                   a.latitude as delivery_lat, a.longitude as delivery_lng
            FROM artifacts art
            JOIN airports a ON art.delivery_airport_id = a.id
            WHERE art.artifact_order = %s
        """, (game['current_artifact_number'],))
        artifact = cursor.fetchone()
        
        # Log game start
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, description)
            VALUES (%s, 'event', %s)
        """, (game_id, f"Game started at {game['airport_name']}. Find and deliver 10 artifacts! You have 20 flights."))
        
        conn.commit()
        
        session['game_id'] = game_id
        
        return jsonify({
            'success': True,
            'game': game,
            'artifact': artifact
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)})
    finally:
        cursor.close()
        conn.close()

@app.route('/api/game/current')
def get_current_game():
    game_id = session.get('game_id')
    if not game_id:
        return jsonify({'success': False, 'error': 'No active game'})
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("""
            SELECT g.*, a.code as airport_code, a.name as airport_name, 
                   a.city, a.country, a.latitude, a.longitude
            FROM games g 
            JOIN airports a ON g.current_airport_id = a.id 
            WHERE g.id = %s
        """, (game_id,))
        game = cursor.fetchone()
        
        if not game:
            return jsonify({'success': False, 'error': 'Game not found'})
        
        # Get current artifact with delivery airport info
        cursor.execute("""
            SELECT art.*, a.name as delivery_airport_name, a.code as delivery_airport_code,
                   a.latitude as delivery_lat, a.longitude as delivery_lng
            FROM artifacts art
            JOIN airports a ON art.delivery_airport_id = a.id
            WHERE art.artifact_order = %s
        """, (game['current_artifact_number'],))
        artifact = cursor.fetchone()
        
        # Get recent events
        cursor.execute("""
            SELECT * FROM logs 
            WHERE game_id = %s 
            ORDER BY created_at DESC 
            LIMIT 10
        """, (game_id,))
        events = cursor.fetchall()
        
        # Check game status
        if game['flights_taken'] >= 20 and game['artifacts_delivered'] < 10:
            cursor.execute("UPDATE games SET game_status = 'LOST' WHERE id = %s", (game_id,))
            game['game_status'] = 'LOST'
        elif game['artifacts_delivered'] >= 10:
            cursor.execute("UPDATE games SET game_status = 'WON' WHERE id = %s", (game_id,))
            game['game_status'] = 'WON'
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'game': game,
            'artifact': artifact,
            'events': events
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        cursor.close()
        conn.close()

@app.route('/api/game/travel', methods=['POST'])
def travel():
    game_id = session.get('game_id')
    if not game_id:
        return jsonify({'success': False, 'error': 'No active game'})
    
    data = request.json
    destination_airport_id = data.get('destination_airport_id')
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Get current game state
        cursor.execute("""
            SELECT g.*, a.latitude as from_lat, a.longitude as from_lng
            FROM games g 
            JOIN airports a ON g.current_airport_id = a.id 
            WHERE g.id = %s
        """, (game_id,))
        game = cursor.fetchone()
        
        # Check flight limit
        if game['flights_taken'] >= 20:
            return jsonify({'success': False, 'error': 'Maximum flights (20) reached! Game over.'})
        
        # Get destination airport
        cursor.execute("SELECT * FROM airports WHERE id = %s", (destination_airport_id,))
        destination = cursor.fetchone()
        
        if not destination:
            return jsonify({'success': False, 'error': 'Destination airport not found'})
        
        # Calculate distance
        distance = calculate_distance(
            game['from_lat'], game['from_lng'],
            destination['latitude'], destination['longitude']
        )
        
        # Check minimum distance requirement (at least 200km)
        if distance < 200:
            return jsonify({'success': False, 'error': f'Distance too short ({distance}km). Minimum 200km required.'})
        
        # Check fuel
        if game['fuel_km'] < distance:
            return jsonify({'success': False, 'error': f'Not enough fuel. Need {distance}km, have {game["fuel_km"]}km'})
        
        # Calculate actual fuel cost with efficiency bonus
        fuel_cost = distance * (1 - game['fuel_efficiency_bonus'] / 100)
        
        # Update game state
        cursor.execute("""
            UPDATE games 
            SET fuel_km = fuel_km - %s, 
                current_airport_id = %s,
                flights_taken = flights_taken + 1,
                updated_at = NOW()
            WHERE id = %s
        """, (fuel_cost, destination_airport_id, game_id))
        
        # Log the flight
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, from_airport_id, to_airport_id, 
                            distance_km, fuel_change, description)
            VALUES (%s, 'flight', %s, %s, %s, %s, %s)
        """, (game_id, game['current_airport_id'], destination_airport_id, 
              distance, -fuel_cost, f"Flew {distance}km from {game['current_airport_id']} to {destination['code']}"))
        
        # Trigger random event (30% chance)
        event_result = None
        if random.random() < 0.3:
            event_result = trigger_random_event(game_id, destination_airport_id, cursor)
        
        # Check for artifact delivery
        delivery_result = check_artifact_delivery(game_id, destination_airport_id, cursor)
        
        # Check game completion
        cursor.execute("SELECT artifacts_delivered, flights_taken FROM games WHERE id = %s", (game_id,))
        game_state = cursor.fetchone()
        
        if game_state['artifacts_delivered'] >= 10:
            cursor.execute("UPDATE games SET game_status = 'WON', total_score = calculate_score(id) WHERE id = %s", (game_id,))
        elif game_state['flights_taken'] >= 20:
            cursor.execute("UPDATE games SET game_status = 'LOST' WHERE id = %s", (game_id,))
        
        conn.commit()
        
        # Get updated game state
        cursor.execute("""
            SELECT g.*, a.code as airport_code, a.name as airport_name, 
                   a.city, a.country, a.latitude, a.longitude
            FROM games g 
            JOIN airports a ON g.current_airport_id = a.id 
            WHERE g.id = %s
        """, (game_id,))
        updated_game = cursor.fetchone()
        
        return jsonify({
            'success': True,
            'game': updated_game,
            'distance': distance,
            'fuel_cost': fuel_cost,
            'event': event_result,
            'delivery': delivery_result
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)})
    finally:
        cursor.close()
        conn.close()

@app.route('/api/game/buy', methods=['POST'])
def buy_item():
    game_id = session.get('game_id')
    if not game_id:
        return jsonify({'success': False, 'error': 'No active game'})
    
    data = request.json
    shop_item_id = data.get('shop_item_id')
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Get game state
        cursor.execute("SELECT * FROM games WHERE id = %s", (game_id,))
        game = cursor.fetchone()
        
        # Get shop item
        cursor.execute("SELECT * FROM shop_items WHERE id = %s", (shop_item_id,))
        item = cursor.fetchone()
        
        if not item:
            return jsonify({'success': False, 'error': 'Item not found'})
        
        if game['money'] < item['price']:
            return jsonify({'success': False, 'error': 'Not enough money'})
        
        # Apply item effects
        if item['category'] == 'fuel':
            new_fuel = min(game['fuel_km'] + item['effect_value'], game['max_fuel_capacity'])
            cursor.execute("UPDATE games SET fuel_km = %s, money = money - %s WHERE id = %s",
                          (new_fuel, item['price'], game_id))
            
        elif item['category'] == 'upgrade':
            if item['item_type'] == 'fuel_capacity':
                cursor.execute("UPDATE games SET max_fuel_capacity = max_fuel_capacity + %s, money = money - %s WHERE id = %s",
                              (item['effect_value'], item['price'], game_id))
            elif item['item_type'] == 'fuel_efficiency':
                cursor.execute("UPDATE games SET fuel_efficiency_bonus = fuel_efficiency_bonus + %s, money = money - %s WHERE id = %s",
                              (item['effect_value'], item['price'], game_id))
            elif item['item_type'] == 'flight_discount':
                cursor.execute("UPDATE games SET flight_discount_percent = flight_discount_percent + %s, money = money - %s WHERE id = %s",
                              (item['effect_value'], item['price'], game_id))
        
        elif item['category'] == 'lootbox':
            # Handle lootbox purchase
            reward_money = random.randint(200, 800)
            reward_fuel = random.randint(300, 600)
            cursor.execute("UPDATE games SET money = money + %s, fuel_km = LEAST(max_fuel_capacity, fuel_km + %s) WHERE id = %s",
                          (reward_money, reward_fuel, game_id))
            cursor.execute("UPDATE games SET money = money - %s WHERE id = %s", (item['price'], game_id))
        
        # Add to inventory for permanent items
        if item['is_permanent']:
            cursor.execute("""
                INSERT INTO player_inventory (game_id, shop_item_id, quantity)
                VALUES (%s, %s, 1)
            """, (game_id, shop_item_id))
        
        # Log purchase
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, shop_item_id, money_change, description)
            VALUES (%s, 'purchase', %s, %s, %s)
        """, (game_id, shop_item_id, -item['price'], f"Purchased {item['name']}"))
        
        conn.commit()
        
        # Get updated game state
        cursor.execute("SELECT * FROM games WHERE id = %s", (game_id,))
        updated_game = cursor.fetchone()
        
        return jsonify({
            'success': True,
            'game': updated_game,
            'item': item,
            'reward_money': reward_money if item['category'] == 'lootbox' else 0,
            'reward_fuel': reward_fuel if item['category'] == 'lootbox' else 0
        })
        
    except Exception as e:
        conn.rollback()
        return jsonify({'success': False, 'error': str(e)})
    finally:
        cursor.close()
        conn.close()

@app.route('/api/game/score')
def get_score():
    game_id = session.get('game_id')
    if not game_id:
        return jsonify({'success': False, 'error': 'No active game'})
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("SELECT * FROM games WHERE id = %s", (game_id,))
        game = cursor.fetchone()
        
        if not game:
            return jsonify({'success': False, 'error': 'Game not found'})
        
        # Calculate score based on your formula
        base_score = 10000
        artifacts_bonus = game['artifacts_delivered'] * 5000
        money_bonus = game['money'] // 10
        fuel_bonus = game['fuel_km'] // 5
        quests_bonus = game['artifacts_delivered'] * 500  # Using artifacts as quests
        flights_penalty = game['flights_taken'] * 20
        speed_bonus = max(0, 10 - game['flights_taken']) * 1000
        
        total_score = (base_score + artifacts_bonus + money_bonus + 
                      fuel_bonus + quests_bonus - flights_penalty + speed_bonus)
        
        return jsonify({
            'success': True,
            'score_breakdown': {
                'base_score': base_score,
                'artifacts_bonus': artifacts_bonus,
                'money_bonus': money_bonus,
                'fuel_bonus': fuel_bonus,
                'quests_bonus': quests_bonus,
                'flights_penalty': flights_penalty,
                'speed_bonus': speed_bonus,
                'total_score': total_score
            }
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        cursor.close()
        conn.close()

@app.route('/api/airports')
def get_airports():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("SELECT * FROM airports")
        airports = cursor.fetchall()
        return jsonify({'success': True, 'airports': airports})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        cursor.close()
        conn.close()

@app.route('/api/shop-items')
def get_shop_items():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("SELECT * FROM shop_items ORDER BY category, price")
        items = cursor.fetchall()
        return jsonify({'success': True, 'items': items})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        cursor.close()
        conn.close()

# Helper functions
def calculate_distance(lat1, lon1, lat2, lon2):
    # Haversine formula
    R = 6371  # Earth radius in km
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = (math.sin(dlat/2) * math.sin(dlat/2) +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon/2) * math.sin(dlon/2))
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    distance = R * c
    
    return int(distance)

def trigger_random_event(game_id, airport_id, cursor):
    # Get random event based on probability weights
    cursor.execute("""
        SELECT * FROM event_types 
        ORDER BY -LOG(1-RAND())/probability_weight LIMIT 1
    """)
    event = cursor.fetchone()
    
    if event:
        # Apply event effects
        money_change = random.randint(event['effect_money_min'], event['effect_money_max'])
        fuel_change = random.randint(event['effect_fuel_min'], event['effect_fuel_max'])
        
        if money_change != 0:
            cursor.execute("UPDATE games SET money = money + %s WHERE id = %s", (money_change, game_id))
        
        if fuel_change != 0:
            cursor.execute("UPDATE games SET fuel_km = GREATEST(0, fuel_km + %s) WHERE id = %s", (fuel_change, game_id))
        
        # Log event
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, event_type_id, money_change, fuel_change, description)
            VALUES (%s, 'event', %s, %s, %s, %s)
        """, (game_id, event['id'], money_change, fuel_change, event['description']))
        
        return {
            'name': event['name'],
            'description': event['description'],
            'money_change': money_change,
            'fuel_change': fuel_change,
            'category': event['event_category']
        }
    
    return None

def check_artifact_delivery(game_id, airport_id, cursor):
    # Check if current artifact should be delivered here
    cursor.execute("""
        SELECT g.current_artifact_number, art.delivery_airport_id, art.name as artifact_name,
               art.delivery_reward_money, art.delivery_reward_fuel, art.description
        FROM games g
        JOIN artifacts art ON g.current_artifact_number = art.artifact_order
        WHERE g.id = %s
    """, (game_id,))
    artifact_info = cursor.fetchone()
    
    if artifact_info and artifact_info['delivery_airport_id'] == airport_id:
        # Deliver artifact
        cursor.execute("""
            UPDATE games 
            SET artifacts_delivered = artifacts_delivered + 1,
                current_artifact_number = current_artifact_number + 1,
                money = money + %s,
                fuel_km = LEAST(max_fuel_capacity, fuel_km + %s)
            WHERE id = %s
        """, (artifact_info['delivery_reward_money'], artifact_info['delivery_reward_fuel'], game_id))
        
        # Log delivery
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, money_change, fuel_change, description)
            VALUES (%s, 'delivery', %s, %s, %s)
        """, (game_id, artifact_info['delivery_reward_money'], artifact_info['delivery_reward_fuel'],
              f"Delivered {artifact_info['artifact_name']}!"))
        
        # Get next artifact if exists
        next_artifact = None
        if artifact_info['current_artifact_number'] < 10:
            cursor.execute("""
                SELECT art.*, a.name as delivery_airport_name, a.code as delivery_airport_code
                FROM artifacts art
                JOIN airports a ON art.delivery_airport_id = a.id
                WHERE art.artifact_order = %s
            """, (artifact_info['current_artifact_number'] + 1,))
            next_artifact = cursor.fetchone()
        
        return {
            'delivered': True,
            'artifact_name': artifact_info['artifact_name'],
            'artifact_description': artifact_info['description'],
            'reward_money': artifact_info['delivery_reward_money'],
            'reward_fuel': artifact_info['delivery_reward_fuel'],
            'next_artifact': next_artifact
        }
    
    return {'delivered': False}

if __name__ == '__main__':
    app.run(debug=True, port=5000)