<?php
/**
 * FitTrack — Calorie Calculator API
 * Formula: Calories = MET × weight(kg) × duration(hours)
 * MET (Metabolic Equivalent of Task) values are scientifically established
 * intensity multipliers for each exercise type.
 *
 * Usage: POST or GET with params: type, duration (minutes), weight (kg), intensity (optional)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');

// ─── MET TABLE ────────────────────────────────────────────────────────────────
// Source: Compendium of Physical Activities (Ainsworth et al.)
// Format: workout_name => [ low_intensity_MET, moderate_MET, high_MET ]
$MET_TABLE = [

    // ── CARDIO ────────────────────────────────────────────────────────────────
    'running'          => [7.0,  9.8,  12.0],
    'jogging'          => [6.0,  7.0,   8.5],
    'walking'          => [2.8,  3.5,   5.0],
    'cycling'          => [5.0,  8.0,  12.0],
    'swimming'         => [5.0,  7.0,  10.0],
    'rowing'           => [4.5,  7.0,   8.5],
    'jump rope'        => [8.0, 10.0,  12.0],
    'elliptical'       => [5.0,  6.5,   8.0],
    'stair climbing'   => [4.0,  8.0,  10.0],
    'dance'            => [3.0,  5.5,   8.0],
    'aerobics'         => [5.0,  7.0,   9.0],
    'cardio'           => [5.0,  7.0,  10.0],   // generic fallback

    // ── STRENGTH / RESISTANCE ─────────────────────────────────────────────────
    'weight lifting'   => [3.0,  5.0,   6.0],
    'strength training'=> [3.0,  5.0,   6.0],
    'strength'         => [3.0,  5.0,   6.0],   // generic
    'bench press'      => [3.5,  5.0,   6.0],
    'squats'           => [4.0,  5.5,   7.0],
    'deadlift'         => [4.5,  6.0,   7.5],
    'pull ups'         => [4.0,  6.0,   8.0],
    'push ups'         => [3.5,  5.0,   6.5],
    'dumbbell'         => [3.0,  4.5,   6.0],
    'barbell'          => [3.5,  5.0,   6.5],
    'resistance bands' => [2.5,  3.5,   5.0],
    'circuit training' => [5.0,  7.5,   9.0],
    'crossfit'         => [6.0,  9.0,  12.0],
    'kettlebell'       => [6.0,  8.0,  10.0],
    'functional training'=> [4.0, 6.0,  8.0],

    // ── HIIT ──────────────────────────────────────────────────────────────────
    'hiit'             => [7.0, 10.0,  14.0],
    'tabata'           => [7.5, 11.0,  14.0],
    'burpees'          => [7.0, 10.0,  12.0],
    'box jumps'        => [6.0,  9.0,  12.0],
    'mountain climbers'=> [6.5,  9.5,  12.0],
    'sprint intervals' => [8.0, 12.0,  15.0],

    // ── FLEXIBILITY / YOGA ────────────────────────────────────────────────────
    'yoga'             => [2.5,  3.0,   4.0],
    'hot yoga'         => [3.0,  4.5,   6.0],
    'pilates'          => [3.0,  4.0,   5.5],
    'stretching'       => [2.3,  2.8,   3.5],
    'flexibility'      => [2.3,  2.8,   3.5],   // generic
    'tai chi'          => [2.5,  3.0,   4.0],

    // ── SPORTS ────────────────────────────────────────────────────────────────
    'basketball'       => [5.5,  8.0,  10.0],
    'football'         => [6.0,  9.0,  12.0],
    'soccer'           => [6.0,  9.0,  12.0],
    'tennis'           => [5.0,  7.5,  10.0],
    'badminton'        => [4.5,  6.5,   8.5],
    'volleyball'       => [3.0,  4.5,   8.0],
    'cricket'          => [4.0,  6.0,   8.0],
    'boxing'           => [7.0, 10.0,  13.0],
    'martial arts'     => [6.0,  9.0,  12.0],
    'wrestling'        => [6.0,  9.0,  12.0],
    'rock climbing'    => [6.0,  8.5,  11.0],
    'hiking'           => [4.5,  6.0,   8.0],
];

// ─── DEFAULT MET per category (fallback) ─────────────────────────────────────
$CATEGORY_MET = [
    'strength'    => [3.0, 5.0, 6.5],
    'cardio'      => [5.0, 7.5, 10.0],
    'hiit'        => [7.0, 10.0, 14.0],
    'flexibility' => [2.3, 2.8, 3.5],
    'yoga'        => [2.5, 3.0, 4.0],
];

// ─── PARSE INPUT ─────────────────────────────────────────────────────────────
$input = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    $input = $json ?: $_POST;
} else {
    $input = $_GET;
}

$workout_name = strtolower(trim($input['name']     ?? $input['type'] ?? ''));
$category     = strtolower(trim($input['category'] ?? $input['type'] ?? 'cardio'));
$duration_min = floatval($input['duration'] ?? 30);
$weight_kg    = floatval($input['weight']   ?? 70);
$intensity    = strtolower(trim($input['intensity'] ?? 'moderate')); // low | moderate | high

// ─── VALIDATE ────────────────────────────────────────────────────────────────
$errors = [];
if ($duration_min <= 0 || $duration_min > 600) $errors[] = 'Duration must be between 1 and 600 minutes.';
if ($weight_kg   <= 0 || $weight_kg   > 400)   $errors[] = 'Weight must be between 1 and 400 kg.';
if (!in_array($intensity, ['low','moderate','high'])) $intensity = 'moderate';

if (!empty($errors)) {
    echo json_encode(['success' => false, 'errors' => $errors]);
    exit;
}

// ─── PICK INTENSITY INDEX ────────────────────────────────────────────────────
$idx = ['low' => 0, 'moderate' => 1, 'high' => 2][$intensity];

// ─── FIND MET ─────────────────────────────────────────────────────────────────
$met = null;
$matched_name = '';

// 1. Try exact match on workout name
if (isset($MET_TABLE[$workout_name])) {
    $met = $MET_TABLE[$workout_name][$idx];
    $matched_name = $workout_name;
}

// 2. Try partial match (e.g. "morning run" → "running")
if ($met === null) {
    foreach ($MET_TABLE as $key => $vals) {
        if (strpos($workout_name, $key) !== false || strpos($key, $workout_name) !== false) {
            $met = $vals[$idx];
            $matched_name = $key;
            break;
        }
    }
}

// 3. Fallback to category-level MET
if ($met === null) {
    $cat = $CATEGORY_MET[$category] ?? $CATEGORY_MET['cardio'];
    $met = $cat[$idx];
    $matched_name = $category . ' (category estimate)';
}

// ─── CALCULATE ───────────────────────────────────────────────────────────────
// Calories = MET × weight_kg × duration_hours
$duration_hours = $duration_min / 60.0;
$calories = round($met * $weight_kg * $duration_hours);

// Also calculate all 3 intensities for comparison
$all_intensities = [];
$met_arr = $MET_TABLE[$matched_name] ?? ($CATEGORY_MET[$category] ?? $CATEGORY_MET['cardio']);
foreach (['low' => 0, 'moderate' => 1, 'high' => 2] as $label => $i) {
    $all_intensities[$label] = round($met_arr[$i] * $weight_kg * $duration_hours);
}

// ─── RESPONSE ─────────────────────────────────────────────────────────────────
echo json_encode([
    'success'       => true,
    'calories'      => $calories,
    'met'           => $met,
    'matched'       => $matched_name,
    'intensity'     => $intensity,
    'duration_min'  => $duration_min,
    'weight_kg'     => $weight_kg,
    'formula'       => "Calories = MET ({$met}) × weight ({$weight_kg} kg) × time ({$duration_hours} hrs)",
    'range'         => $all_intensities,
    'note'          => 'Estimates based on MET values from the Compendium of Physical Activities (Ainsworth et al.). Actual calories vary with age, fitness level, and form.'
]);
