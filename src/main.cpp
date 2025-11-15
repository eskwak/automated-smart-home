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

// const char* WIFI SSID = "...";
// const char* WIFI_PASSWORD = "...";


// ============================================================================
//                         STATE TRACKING VARIABLES
// ============================================================================
uint8_t last_heating_pad_state = 0;
uint8_t last_temperature_sensor_state = 0;


// ============================================================================
//                    CAMERA (SERVO) ORIENTATION VARIABLES
// ============================================================================
Servo camera_servo;

// Camera movement tracking
int current_servo_pos = 90;
uint8_t servo_left = 0;
uint8_t servo_right = 0;


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
  camera_servo.attach(CAMERA_LEFT_RIGHT_PIN);
  camera_servo.write(current_servo_pos);

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
    if (!Firebase.beginStream(heating_pad_data, "/heating_pad/state")) {
      Serial.printf("Failed to set up listener for heating_pad. ERROR: %s\n", heating_pad_data.errorReason());
    }
    else {
      Serial.printf("Listener for heating_pad setup successful\n");
    }

    if (!Firebase.beginStream(temperature_sensor_data, "/temperature_sensor/state")) {
      Serial.printf("Failed to set up listener for temperature_sensor. ERROR: %s\n", temperature_sensor_data.errorReason());
    }
    else {
      Serial.printf("Listener for temperature_sensor setup successful\n");
    }

    if (!Firebase.beginStream(servo_left_data, "/camera_servo/left")) {
      Serial.printf("Failed to set up listener for servo_left: %s\n", servo_left_data.errorReason());
    }
    else {
      Serial.printf("Listener for servo_left setup successful\n");
    }

    if (!Firebase.beginStream(servo_right_data, "/camera_servo/right")) {
      Serial.printf("Failed to set up listener for servo_right: %s\n", servo_right_data.errorReason());
    }
    else {
      Serial.printf("Listener for servo_right setup successful\n");
    }
  }
  else {
    Serial.printf("Failed to configure RTDB\n");
  }

  delay(100);
}


// ============================================================================
//                                    LOOP
// ============================================================================
void loop(void) {
  // Check and handle DB connectivity issues
  if (!Firebase.ready()) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("DB not ready. Attempting to reconnect\n");
      Firebase.reconnectWiFi(false);
      delay(1000);

      // Try to reconnect streams for each peripheral that interfaces with the DB
      if (Firebase.ready() && !heating_pad_data.streamTimeout()) {
        if (!Firebase.beginStream(heating_pad_data, "/heating_pad/state")) {
          Serial.printf("ERROR: %s\n", heating_pad_data.errorReason());
        }
        else {
          Serial.printf("Heating pad stream connected\n");
        }
      }

      if (Firebase.ready() && !temperature_sensor_data.streamTimeout()) {
        if (!Firebase.beginStream(temperature_sensor_data, "temperature_sensor/state")) {
          Serial.printf("ERROR: %s\n", temperature_sensor_data.errorReason());
        }
        else {
          Serial.printf("Temperature sensor stream connected\n");
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

  // Servo left stream handling
  if (!Firebase.readStream(servo_left_data)) {
    if (servo_left_data.streamTimeout()) {
      Firebase.beginStream(servo_left_data, "/camera_servo/left");
    }
  }
  if (servo_left_data.streamAvailable()) {
    servo_left = servo_left_data.intData();
  }

  // Servo right stream handling
  if (!Firebase.readStream(servo_right_data)) {
    if (servo_right_data.streamTimeout()) {
      Firebase.beginStream(servo_right_data, "/camera_servo/right");
    }
  }
  if (servo_right_data.streamAvailable()) {
    servo_right = servo_right_data.intData();
  }

  // Servo movement handling
  if (servo_left == 1 && servo_right == 0) {
    if (current_servo_pos > 0) {
      current_servo_pos -= 5;
      camera_servo.write(current_servo_pos);
    }
  }
  else if (servo_left == 0 && servo_right == 1) {
    if (current_servo_pos < 180) {
      current_servo_pos += 5;
      camera_servo.write(current_servo_pos);
    }
  }

  delay(100);
}