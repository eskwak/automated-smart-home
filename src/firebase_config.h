/**
 * Description:     Holds all firebase configuration objects
 * 
 * Author:          Eddie Kwak
 * Last Modified:   11/15/2025
 */

#ifndef FIREBASE_CONFIG_H
#define FIREBASE_CONFIG_H

#include <FirebaseESP32.h>

// Holds RTDB data and stream info
FirebaseData heating_pad_data;
FirebaseData temperature_sensor_data;
FirebaseData servo_x_angle_data;
FirebaseData servo_y_angle_data;
FirebaseData laser_x_angle_data;
FirebaseData laser_y_angle_data;

// Firebase auth object
FirebaseAuth firebase_auth;

// Firebase config object
FirebaseConfig firebase_config;

#endif