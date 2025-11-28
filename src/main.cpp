/**
 * Automated smart home firmware for ESP32
 * 
 * Description:     This program connects an ESP32 to Firebase RTDB to control
 *                  peripherals remotely via web app. The ESP32 listens for 
 *                  changes in the RTDB and updates GPIO pins.
 * 
 *                  I recognize that when porting this over to the Raspberry Pi
 *                  compute module, the Arduino-style setup() and loop() structure
 *                  probably won't hold 1:1. However, the core logic of how the 
 *                  firmware is designed shouldn't change: Everything that only 
 *                  requires a single execution should be handled separately 
 *                  from elements of the program that require repeated execution.
 * 
 * Author:          Eddie Kwak
 * Last Modified:   11/15/2025
 */

#include <WiFi.h>
#include <ESP32Servo.h>
#include "firebase_config.h"
#include "gpio.h"

// ============================================================================
//                               CONFIGURATION
// ============================================================================
// RTDB URL (DO NOT CHANGE)
#define REALTIME_DATABASE_URL "cat-automated-smart-home-default-rtdb.firebaseio.com"

// Network credentials (will not be pushed)

// const char* WIFI_SSID = "SSID";
// const char* WIFI_PASSWORD = "password";


// ============================================================================
//                         STATE TRACKING VARIABLES
// ============================================================================
uint8_t last_heating_pad_state = 0;
uint8_t last_temperature_sensor_state = 0;


// ============================================================================
//                    CAMERA (SERVO) ORIENTATION VARIABLES
// ============================================================================
// Servo objects to control horizontal movement
Servo camera_servo_left_right;
Servo camera_servo_up_down;

// Camera positions (0-180)
int camera_left_right_servo_pos = 90;
int camera_up_down_servo_pos = 90;

// Servo objects to control vertical movement
Servo laser_servo_left_right;
Servo laser_servo_up_down;

// laser positions 
int laser_left_right_servo_pos = 90;
int laser_up_down_servo_pos = 90;


// ============================================================================
//                                SETUP 
// ============================================================================
void setup(void) {
  Serial.begin(115200);
  delay(100);

  // GPIO modes
  pinMode(HEATING_PAD_PIN, OUTPUT);
  pinMode(TEMPERATURE_SENSOR_PIN, OUTPUT);

  // GPIO initializations
  digitalWrite(HEATING_PAD_PIN, LOW);
  digitalWrite(TEMPERATURE_SENSOR_PIN, LOW);

  // Setup servos for camera orientation and movement
  camera_servo_left_right.attach(CAMERA_LEFT_RIGHT_PIN);
  camera_servo_left_right.write(camera_left_right_servo_pos);
  camera_servo_up_down.attach(CAMERA_UP_DOWN_PIN);
  camera_servo_up_down.write(camera_up_down_servo_pos);

  // Setup servos for laser orientation and movement.
  laser_servo_left_right.attach(LASER_LEFT_RIGHT_PIN);
  laser_servo_left_right.write(laser_left_right_servo_pos);
  laser_servo_up_down.attach(LASER_UP_DOWN_PIN);
  laser_servo_up_down.write(laser_up_down_servo_pos);

  delay(100);

  // Wifi connection setup
  Serial.printf("Connecting to: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(250);
  Serial.print("Connection successful\n");

  // Configure and initialize RTDB connection
  firebase_config.database_url = REALTIME_DATABASE_URL;
  firebase_config.signer.test_mode = true;
  Firebase.begin(&firebase_config, &firebase_auth);
  Firebase.reconnectWiFi(true);

  Serial.printf("Waiting for RTDB connection\n");
  uint8_t retry_count = 0;
  while (!Firebase.ready() && retry_count < 10) {
    delay(500);
    retry_count++;
  }

  if (Firebase.ready()) Serial.printf("RTDB connection successful\n");
  else Serial.printf("RTDB connection failed\n");

  // Setup for RTDB listeners
  if (Firebase.ready()) {
    // Heating pad listener
    if (!Firebase.beginStream(heating_pad_data, "/heating_pad/state")) {
      Serial.printf("Failed to set up listener for heating_pad. ERROR: %s\n", heating_pad_data.errorReason());
    }
    else {
      Serial.printf("Listener for heating_pad setup successful\n");
    }

    // Temperature sensor listener
    if (!Firebase.beginStream(temperature_sensor_data, "/temperature_sensor/state")) {
      Serial.printf("Failed to set up listener for temperature_sensor. ERROR: %s\n", temperature_sensor_data.errorReason());
    }
    else {
      Serial.printf("Listener for temperature_sensor setup successful\n");
    }

    // Camera left/right position listener
    if (!Firebase.beginStream(camera_x_angle_data, "/camera_servo/x_angle")) {
      Serial.printf("Failed to set up listener for camera_x_angle_data: %s\n", camera_x_angle_data.errorReason());
    }
    else {
      Serial.printf("Listener for servo_x_angle setup successful\n");
    }

    // Camera up/down position listener
    if (!Firebase.beginStream(camera_y_angle_data, "/camera_servo/y_angle")) {
      Serial.printf("Failed to set up listener for camera_y_angle_data: %s\n", camera_y_angle_data.errorReason());
    }
    else {
      Serial.printf("Listener for servo_y_angle setup succesful\n");
    }

    // Laser left/right position listener
    if (!Firebase.beginStream(laser_x_angle_data, "/laser_servo/x_angle")) {
      Serial.printf("Failed to set up listener for laser_x_angle: %s\n", laser_x_angle_data.errorReason());
    }
    else {
      Serial.printf("Listener for laser_x_angle setup successful\n");
    }

    // Laser up/down position listener
    if (!Firebase.beginStream(laser_y_angle_data, "/laser_servo/y_angle")) {
      Serial.printf("Failed to set up listener for laser_y_angle: %s\n", laser_y_angle_data.errorReason());
    }
    else {
      Serial.printf("Listener for laser_y_angle setup successful\n");
    }
  }
  // Failure to setup listeners for the RTDB
  else {
    Serial.printf("Listener setup failed\n");
  }

  delay(100);
}


// ============================================================================
//                                    LOOP
// ============================================================================
void loop(void) {
  // On each iteration, handle connectivity issues for listeners.
  // This realistically shouldn't happen unless the cat tower loses wifi connection.
  if (!Firebase.ready()) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("DB not ready. Attempting to reconnect\n");
      Firebase.reconnectWiFi(false);
      delay(1000);

      // Try to reconnect the heating pad listener.
      if (Firebase.ready() && !heating_pad_data.streamTimeout()) {
        if (!Firebase.beginStream(heating_pad_data, "/heating_pad/state")) {
          Serial.printf("ERROR: %s\n", heating_pad_data.errorReason());
        }
        else {
          Serial.printf("Heating pad stream connected\n");
        }
      }

      // Try to reconnect the temperature sensor listener.
      if (Firebase.ready() && !temperature_sensor_data.streamTimeout()) {
        if (!Firebase.beginStream(temperature_sensor_data, "/temperature_sensor/state")) {
          Serial.printf("ERROR: %s\n", temperature_sensor_data.errorReason());
        }
        else {
          Serial.printf("Temperature sensor stream connected\n");
        }
      }

      // Try to reconnect the camera horizontal movement listener.
      if (Firebase.ready() && !camera_x_angle_data.streamTimeout()) {
        if (!Firebase.beginStream(camera_x_angle_data, "/camera_servo/x_angle")) {
          Serial.printf("ERROR: %s\n", camera_x_angle_data.errorReason());
        }
        else {
          Serial.printf("Camera horizontal movement stream connected\n");
        }
      }

      // Try to reconnect the camera vertical movement listener.
      if (Firebase.ready() && !camera_y_angle_data.streamTimeout()) {
        if (!Firebase.beginStream(camera_y_angle_data, "/camera_servo/y_angle")) {
          Serial.printf("ERROR: %s\n", camera_y_angle_data.errorReason());
        }
        else {
          Serial.printf("Camera vertical movement stream connceted\n");
        }
      }

      // Try to reconnect the laser horizontal movement listener.
      if (Firebase.ready() && !laser_x_angle_data.streamTimeout()) {
        if (!Firebase.beginStream(laser_x_angle_data, "/laser_servo/x_angle")) {
          Serial.printf("ERROR: %s\n", laser_x_angle_data.errorReason());
        }
        else {
          Serial.printf("Laser horizontal movement stream connected\n");
        }
      }

      // Try to reconnect the laser vertical movement listener.
      if (Firebase.ready() && !laser_y_angle_data.streamTimeout()) {
        if (!Firebase.beginStream(laser_y_angle_data, "/laser_servo/y_angle")) {
          Serial.printf("ERROR: %s\n", laser_y_angle_data.errorReason());
        }
        else {
          Serial.printf("Laser vertical movement stream connected\n");
        }
      }
    }
    else {
      Serial.printf("Wifi disconnected. Attempting to reconnect\n");
      WiFi.reconnect();
      delay(500);
    }
    return;
  }

  // Read heating pad data and update heating pad GPIO
  if (!Firebase.readStream(heating_pad_data)) {
    if (heating_pad_data.streamTimeout()) {
      Firebase.beginStream(heating_pad_data, "/heating_pad/state");
    }
    else Serial.printf("ERROR: %s\n", heating_pad_data.errorReason());
  }
  if (heating_pad_data.streamAvailable()) {
    uint8_t heating_pad_state = heating_pad_data.intData();
    if (heating_pad_state != last_heating_pad_state) last_heating_pad_state = heating_pad_state;
    if (heating_pad_state == 1) digitalWrite(HEATING_PAD_PIN, HIGH);
    else digitalWrite(HEATING_PAD_PIN, LOW);
  }

  // Read temp sensor data and update temp sensor GPIO
  if (!Firebase.readStream(temperature_sensor_data)) {
    if (temperature_sensor_data.streamTimeout()) {
      Firebase.beginStream(temperature_sensor_data, "/temperature_sensor/state");
    }
    else Serial.printf("ERROR: %s\n", temperature_sensor_data.errorReason());
  }
  if (temperature_sensor_data.streamAvailable()) {
    uint8_t temperature_sensor_state = temperature_sensor_data.intData();
    if (temperature_sensor_state != last_temperature_sensor_state) last_temperature_sensor_state = temperature_sensor_state;
    if (temperature_sensor_state == 1) digitalWrite(TEMPERATURE_SENSOR_PIN, HIGH);
    else digitalWrite(TEMPERATURE_SENSOR_PIN, LOW);
  }

  // Camera servo left/right angle handling
  if (!Firebase.readStream(camera_x_angle_data)) {
    if (camera_x_angle_data.streamTimeout()) {
      Firebase.beginStream(camera_x_angle_data, "/camera_servo/x_angle");
    }
  }
  if (camera_x_angle_data.streamAvailable()) {
    int x_angle = camera_x_angle_data.intData();
    x_angle = constrain(x_angle, 0, 180);
    camera_left_right_servo_pos = x_angle;
    camera_servo_left_right.write(camera_left_right_servo_pos);
  }

  // Camera servo up/down angle handling
  if (!Firebase.readStream(camera_y_angle_data)) {
    if (camera_y_angle_data.streamTimeout()) {
      Firebase.beginStream(camera_y_angle_data, "/camera_servo/y_angle");
    }
  }
  if (camera_y_angle_data.streamAvailable()) {
    int y_angle = camera_y_angle_data.intData();
    y_angle = constrain(y_angle, 0, 180);
    camera_up_down_servo_pos = y_angle;
    camera_servo_up_down.write(camera_up_down_servo_pos);
  }

  // Laser servo left/right angle handling
  if (!Firebase.readStream(laser_x_angle_data)) {
    if (laser_x_angle_data.streamTimeout()) {
      Firebase.beginStream(laser_x_angle_data, "/laser_servo/x_angle");
    }
  }
  if (laser_x_angle_data.streamAvailable()) {
    int laser_x_angle = laser_x_angle_data.intData();
    laser_x_angle = constrain(laser_x_angle, 10, 170);
    laser_left_right_servo_pos = laser_x_angle;
    laser_servo_left_right.write(laser_left_right_servo_pos);
  }

  // Laser servo up/down angle handling
  if (!Firebase.readStream(laser_y_angle_data)) {
    if (laser_y_angle_data.streamTimeout()) {
      Firebase.beginStream(laser_y_angle_data, "/laser_servo/y_angle");
    }
  }
  if (laser_y_angle_data.streamAvailable()) {
    int laser_y_angle = laser_y_angle_data.intData();
    laser_y_angle = constrain(laser_y_angle, 10, 170);
    laser_up_down_servo_pos = laser_y_angle;
    laser_servo_up_down.write(laser_up_down_servo_pos);
  }

  delay(20);
}