from flask import Flask, jsonify, request, render_template, session, redirect, url_for
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
import json
import random
from datetime import datetime
import math
import os

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'adventurous_traveler_secret_key_2024')
CORS(app, supports_credentials=True)

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'suprim123',
    'database': 'webadventurous_traveler',
    'autocommit': False
}

def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

# ==================== ROUTES ====================

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/resources')
def resources():
    return render_template('resources.html')

@app.route('/welcome')
def welcome():
    return render_template('welcome.html')

@app.route('/story')
def story():
    game_id = request.args.get('game_id') or session.get('game_id')
    if not game_id:
        return redirect(url_for('welcome'))
    return render_template('story.html')

@app.route('/game')
def game():
    game_id = request.args.get('game_id') or session.get('game_id')
    if not game_id:
        return redirect(url_for('welcome'))
    return render_template('game.html')

# ==================== API ====================

@app.route('/api/game/create', methods=['POST'])
def create_game():
    try:
        data = request.json
        player_name = data.get('player_name', 'Adventurer').strip()
        
        if not player_name:
            return jsonify({'success': False, 'error': 'Name required'})
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'Database connection failed'})
        
        cursor = conn.cursor(dictionary=True)
        
        # Get all airports
        cursor.execute("SELECT id FROM airports ORDER BY RAND() LIMIT 1")
        start_airport = cursor.fetchone()
        
        if not start_airport:
            return jsonify({'success': False, 'error': 'No airports found in database'})
        
        # Insert new game
        cursor.execute("""
            INSERT INTO games (player_name, current_airport_id, money, fuel_km, max_fuel_capacity)
            VALUES (%s, %s, 10000, 2500, 5000)
        """, (player_name, start_airport['id']))
        
        game_id = cursor.lastrowid
        
        # Get all 10 artifacts
        cursor.execute("SELECT id, artifact_order FROM artifacts ORDER BY artifact_order")
        all_artifacts = cursor.fetchall()
        
        # Get random unique airports for artifact delivery (excluding start airport)
        cursor.execute("""
            SELECT id FROM airports 
            WHERE id != %s 
            ORDER BY RAND() 
            LIMIT 10
        """, (start_airport['id'],))
        delivery_airports = cursor.fetchall()
        
        if len(delivery_airports) < 10:
            return jsonify({'success': False, 'error': 'Not enough airports for artifact delivery'})
        
        # Assign random airports to each artifact
        for i, artifact in enumerate(all_artifacts):
            delivery_airport = delivery_airports[i]
            cursor.execute("""
                INSERT INTO game_artifact_locations (game_id, artifact_id, artifact_order, delivery_airport_id)
                VALUES (%s, %s, %s, %s)
            """, (game_id, artifact['id'], artifact['artifact_order'], delivery_airport['id']))
        
        # Log the start
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, description)
            VALUES (%s, 'event', %s)
        """, (game_id, f"Game started for {player_name}"))
        
        conn.commit()
        
        # Store in session
        session['game_id'] = game_id
        session['player_name'] = player_name
        
        return jsonify({
            'success': True, 
            'game_id': game_id,
            'player_name': player_name
        })
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        print(f"Create Error: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/game/current')
def get_current_game():
    game_id = request.args.get('game_id') or session.get('game_id')
    
    if not game_id:
        return jsonify({'success': False, 'error': 'No game ID provided'})
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'success': False, 'error': 'Database connection failed'})
    
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Get game state
        cursor.execute("""
            SELECT g.*, a.code as airport_code, a.name as airport_name, 
                   a.city, a.country, a.latitude, a.longitude
            FROM games g 
            LEFT JOIN airports a ON g.current_airport_id = a.id 
            WHERE g.id = %s
        """, (game_id,))
        game = cursor.fetchone()
        
        if not game:
            return jsonify({'success': False, 'error': 'Game not found'})
        
        # Get current artifact info from game_artifact_locations
        cursor.execute("""
            SELECT gal.*, art.name as artifact_name, art.description as artifact_description,
                   art.delivery_reward_money, art.delivery_reward_fuel,
                   ap.code as delivery_airport_code, ap.name as delivery_airport_name,
                   ap.city as delivery_city, ap.country as delivery_country,
                   ap.latitude as delivery_lat, ap.longitude as delivery_lng
            FROM game_artifact_locations gal
            JOIN artifacts art ON gal.artifact_id = art.id
            JOIN airports ap ON gal.delivery_airport_id = ap.id
            WHERE gal.game_id = %s AND gal.artifact_order = %s
        """, (game_id, game['current_artifact_number']))
        artifact_info = cursor.fetchone()
        
        # Get all artifacts status for this game
        cursor.execute("""
            SELECT gal.*, art.name as artifact_name, art.description as artifact_description,
                   ap.code as delivery_airport_code, ap.name as delivery_airport_name
            FROM game_artifact_locations gal
            JOIN artifacts art ON gal.artifact_id = art.id
            JOIN airports ap ON gal.delivery_airport_id = ap.id
            WHERE gal.game_id = %s
            ORDER BY gal.artifact_order
        """, (game_id,))
        all_artifacts = cursor.fetchall()
        
        # Get recent logs
        cursor.execute("""
            SELECT * FROM logs 
            WHERE game_id = %s 
            ORDER BY created_at DESC 
            LIMIT 10
        """, (game_id,))
        logs = cursor.fetchall()
        
        # Check win/lose conditions
        status_changed = False
        if game['flights_taken'] >= 20 and game['artifacts_delivered'] < 10 and game['game_status'] == 'ACTIVE':
            cursor.execute("UPDATE games SET game_status = 'LOST' WHERE id = %s", (game_id,))
            game['game_status'] = 'LOST'
            status_changed = True
        elif game['artifacts_delivered'] >= 10 and game['game_status'] == 'ACTIVE':
            cursor.execute("UPDATE games SET game_status = 'WON' WHERE id = %s", (game_id,))
            game['game_status'] = 'WON'
            status_changed = True
        
        if status_changed:
            conn.commit()
        
        return jsonify({
            'success': True, 
            'game': game, 
            'current_artifact': artifact_info,
            'all_artifacts': all_artifacts,
            'logs': logs
        })
        
    except Exception as e:
        print(f"Get current game error: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        cursor.close()
        conn.close()

@app.route('/api/game/travel', methods=['POST'])
def travel():
    try:
        data = request.json
        game_id = data.get('game_id') or session.get('game_id')
        dest_id = data.get('destination_airport_id')
        
        if not game_id:
            return jsonify({'success': False, 'error': 'No game ID'})
        if not dest_id:
            return jsonify({'success': False, 'error': 'No destination specified'})
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'Database connection failed'})
        
        cursor = conn.cursor(dictionary=True)
        
        # Get current game state
        cursor.execute("""
            SELECT g.*, a.latitude as lat1, a.longitude as lng1, 
                   a.name as airport_name, a.code as airport_code
            FROM games g 
            LEFT JOIN airports a ON g.current_airport_id = a.id
            WHERE g.id = %s
        """, (game_id,))
        game = cursor.fetchone()
        
        if not game:
            return jsonify({'success': False, 'error': 'Game not found'})
        
        if game['game_status'] != 'ACTIVE':
            return jsonify({'success': False, 'error': 'Game is not active'})
        
        if game['flights_taken'] >= 20:
            return jsonify({'success': False, 'error': 'Max flights reached (20)'})
        
        if game['current_airport_id'] == dest_id:
            return jsonify({'success': False, 'error': 'Already at this airport'})
        
        # Get destination airport
        cursor.execute("SELECT * FROM airports WHERE id = %s", (dest_id,))
        dest = cursor.fetchone()
        
        if not dest:
            return jsonify({'success': False, 'error': 'Destination airport not found'})
        
        # Calculate distance
        dist = calculate_distance(
            game['lat1'], game['lng1'], 
            dest['latitude'], dest['longitude']
        )
        
        if dist < 200:
            return jsonify({'success': False, 'error': 'Flight too short (<200km)'})
        
        # Calculate fuel needed with efficiency
        fuel_needed = dist * (1 - game.get('fuel_efficiency_bonus', 0) / 100.0)
        
        if game.get('fuel_km', 0) < fuel_needed:
            return jsonify({'success': False, 'error': 'Not enough fuel'})
        
        # Update game - travel to destination
        cursor.execute("""
            UPDATE games 
            SET fuel_km = fuel_km - %s, 
                current_airport_id = %s,
                flights_taken = flights_taken + 1
            WHERE id = %s
        """, (fuel_needed, dest_id, game_id))
        
        # Log the flight
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, description, distance_km, fuel_change)
            VALUES (%s, 'flight', %s, %s, %s)
        """, (game_id, f"Flew from {game['airport_code']} to {dest['code']}", dist, -fuel_needed))
        
        # Check for random event (30% chance)
        event_result = None
        if random.random() < 0.3:
            event_result = trigger_random_event(game_id, cursor)
        
        # Check for artifact delivery
        delivery_result = check_artifact_delivery(game_id, dest_id, cursor)
        
        # Get updated game state
        cursor.execute("""
            SELECT g.*, a.code as airport_code, a.name as airport_name
            FROM games g 
            JOIN airports a ON g.current_airport_id = a.id
            WHERE g.id = %s
        """, (game_id,))
        updated_game = cursor.fetchone()
        
        conn.commit()
        
        return jsonify({
            'success': True, 
            'game': updated_game, 
            'distance': dist, 
            'fuel_cost': fuel_needed,
            'event': event_result,
            'delivery': delivery_result
        })
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        print(f"Travel error: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

def check_artifact_delivery(game_id, airport_id, cursor):
    """Check if current artifact can be delivered at this airport"""
    # Get current artifact info
    cursor.execute("""
        SELECT gal.*, art.name as artifact_name, art.delivery_reward_money, art.delivery_reward_fuel
        FROM game_artifact_locations gal
        JOIN artifacts art ON gal.artifact_id = art.id
        WHERE gal.game_id = %s AND gal.artifact_order = (
            SELECT current_artifact_number FROM games WHERE id = %s
        )
    """, (game_id, game_id))
    artifact_info = cursor.fetchone()
    
    if not artifact_info:
        return {'delivered': False}
    
    if artifact_info['delivery_airport_id'] == airport_id and not artifact_info['is_delivered']:
        # Deliver artifact
        reward_money = artifact_info['delivery_reward_money']
        reward_fuel = artifact_info['delivery_reward_fuel']
        
        # Update game_artifact_locations
        cursor.execute("""
            UPDATE game_artifact_locations 
            SET is_delivered = 1, delivered_at = NOW()
            WHERE id = %s
        """, (artifact_info['id'],))
        
        # Update games table
        cursor.execute("""
            UPDATE games 
            SET artifacts_delivered = artifacts_delivered + 1,
                current_artifact_number = current_artifact_number + 1,
                money = money + %s,
                fuel_km = LEAST(max_fuel_capacity, fuel_km + %s)
            WHERE id = %s
        """, (reward_money, reward_fuel, game_id))
        
        # Log delivery
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, description, money_change, fuel_change)
            VALUES (%s, 'delivery', %s, %s, %s)
        """, (game_id, f"Delivered {artifact_info['artifact_name']}!", reward_money, reward_fuel))
        
        return {
            'delivered': True,
            'artifact_name': artifact_info['artifact_name'],
            'reward_money': reward_money,
            'reward_fuel': reward_fuel
        }
    
    return {'delivered': False}

def trigger_random_event(game_id, cursor):
    """Trigger a random in-game event"""
    # Get random event type
    cursor.execute("SELECT * FROM event_types ORDER BY RAND() LIMIT 1")
    event_type = cursor.fetchone()
    
    if not event_type:
        return None
    
    # Calculate random values
    money_change = random.randint(
        event_type['effect_money_min'], 
        event_type['effect_money_max']
    )
    fuel_change = random.randint(
        event_type['effect_fuel_min'], 
        event_type['effect_fuel_max']
    )
    
    # Apply changes to game
    if money_change != 0 or fuel_change != 0:
        cursor.execute("""
            UPDATE games 
            SET money = money + %s, 
                fuel_km = GREATEST(0, fuel_km + %s)
            WHERE id = %s
        """, (money_change, fuel_change, game_id))
    
    # Log event
    cursor.execute("""
        INSERT INTO logs (game_id, log_type, description, money_change, fuel_change)
        VALUES (%s, 'event', %s, %s, %s)
    """, (game_id, event_type['description'], money_change, fuel_change))
    
    return {
        'name': event_type['name'],
        'description': event_type['description'],
        'money_change': money_change,
        'fuel_change': fuel_change,
        'category': event_type['event_category']
    }

@app.route('/api/game/buy', methods=['POST'])
def buy_item():
    try:
        data = request.json
        game_id = data.get('game_id') or session.get('game_id')
        item_id = data.get('shop_item_id')
        
        if not game_id:
            return jsonify({'success': False, 'error': 'No game ID'})
        if not item_id:
            return jsonify({'success': False, 'error': 'No item specified'})
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'Database connection failed'})
        
        cursor = conn.cursor(dictionary=True)
        
        # Get game state
        cursor.execute("SELECT * FROM games WHERE id = %s", (game_id,))
        game = cursor.fetchone()
        
        if not game:
            return jsonify({'success': False, 'error': 'Game not found'})
        
        # Get item
        cursor.execute("SELECT * FROM shop_items WHERE id = %s", (item_id,))
        item = cursor.fetchone()
        
        if not item:
            return jsonify({'success': False, 'error': 'Item not found'})
        
        # Check if can afford
        if game['money'] < item['price']:
            return jsonify({'success': False, 'error': 'Not enough money'})
        
        # Apply item effects
        reward_money = 0
        reward_fuel = 0
        
        if item['category'] == 'fuel':
            fuel_to_add = item['effect_value']
            cursor.execute("""
                UPDATE games 
                SET fuel_km = LEAST(max_fuel_capacity, fuel_km + %s), 
                    money = money - %s 
                WHERE id = %s
            """, (fuel_to_add, item['price'], game_id))
            
        elif item['category'] == 'lootbox':
            # Random rewards
            if 'Gold' in item['name']:
                reward_money = random.randint(2000, 5000)
                reward_fuel = random.randint(1500, 3000)
            elif 'Silver' in item['name']:
                reward_money = random.randint(800, 2000)
                reward_fuel = random.randint(700, 1200)
            else:  # Bronze
                reward_money = random.randint(200, 800)
                reward_fuel = random.randint(300, 600)
            
            cursor.execute("""
                UPDATE games 
                SET money = money - %s + %s, 
                    fuel_km = LEAST(max_fuel_capacity, fuel_km + %s) 
                WHERE id = %s
            """, (item['price'], reward_money, reward_fuel, game_id))
            
        elif item['category'] == 'upgrade':
            if item['item_type'] == 'fuel_capacity':
                cursor.execute("""
                    UPDATE games 
                    SET max_fuel_capacity = max_fuel_capacity + %s, 
                        money = money - %s 
                    WHERE id = %s
                """, (item['effect_value'], item['price'], game_id))
            elif item['item_type'] == 'fuel_efficiency':
                cursor.execute("""
                    UPDATE games 
                    SET fuel_efficiency_bonus = fuel_efficiency_bonus + %s, 
                        money = money - %s 
                    WHERE id = %s
                """, (item['effect_value'], item['price'], game_id))
            elif item['item_type'] == 'flight_discount':
                cursor.execute("""
                    UPDATE games 
                    SET flight_discount_percent = flight_discount_percent + %s, 
                        money = money - %s 
                    WHERE id = %s
                """, (item['effect_value'], item['price'], game_id))
        
        # Log purchase
        cursor.execute("""
            INSERT INTO logs (game_id, log_type, description, money_change)
            VALUES (%s, 'purchase', %s, %s)
        """, (game_id, f"Bought {item['name']}", -item['price']))
        
        # Get updated game state
        cursor.execute("SELECT * FROM games WHERE id = %s", (game_id,))
        updated_game = cursor.fetchone()
        
        conn.commit()
        
        return jsonify({
            'success': True, 
            'game': updated_game, 
            'item': item,
            'reward_money': reward_money,
            'reward_fuel': reward_fuel
        })
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        print(f"Buy error: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

# Static data endpoints
@app.route('/api/airports')
def get_airports():
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'Database connection failed'})
        
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM airports ORDER BY name")
        airports = cursor.fetchall()
        
        return jsonify({'success': True, 'airports': airports})
        
    except Exception as e:
        print(f"Get airports error: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/shop-items')
def get_shop_items():
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'Database connection failed'})
        
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM shop_items ORDER BY category, price")
        items = cursor.fetchall()
        
        return jsonify({'success': True, 'items': items})
        
    except Exception as e:
        print(f"Get shop items error: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/artifacts')
def get_artifacts():
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'success': False, 'error': 'Database connection failed'})
        
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM artifacts ORDER BY artifact_order")
        artifacts = cursor.fetchall()
        
        return jsonify({'success': True, 'artifacts': artifacts})
        
    except Exception as e:
        print(f"Get artifacts error: {e}")
        return jsonify({'success': False, 'error': str(e)})
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

# Helper functions
def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates in km"""
    R = 6371  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat/2)**2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
         math.sin(dlon/2)**2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return int(R * c)

@app.route('/api/game/reset', methods=['POST'])
def reset_game():
    """Reset game state"""
    session.clear()
    return jsonify({'success': True, 'message': 'Game reset'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)