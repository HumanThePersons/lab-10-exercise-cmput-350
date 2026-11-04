#version 120 

// (way more precision than a float can actually store...)
#define LOG_2 0.6931471805599453094172321214581765680755001

// start using these antialiasing values once you start (c)
#define AA 2
const int TOTAL_SAMPLES = AA * AA;

uniform vec2 c;
uniform int MAX_ITERS;
uniform vec2 windowSizePixels;
uniform vec2 camCenterWorld;
uniform float camWorldUnitsPerPixel;

// reprojection (1d) may require extra uniforms here...
uniform int TRUE_MAX_ITERS;
uniform vec2 oldCamCenterWorld;
uniform float oldCamWorldUnitsPerPixel;
uniform sampler2D oldFrame;
uniform bool prevFrame;

const float MIN_ALPHA = 0.1;

// Use this to get a color from your smoothed Julia set escape times.
vec4 colorTime(float t) {
    return vec4(0.5 + 0.5 * cos(  0.1 * (t) + vec3(0.f, 0.35, 0.7)), 1.f);
}

struct EscapeTime {
    float iters;
    bool isInf;
};

// Escape time of iterating z^2 + c
EscapeTime escapeTimeSmooth(vec2 z) {
    vec2 currentZ = z;  // start at z0 = z

    for (int i = 1; i <= MAX_ITERS; i++){
        // Check if current z has escaped
        bool escaped = length(currentZ) > 4.0;

        // Get next z - complex square of z plus c
        currentZ = vec2(currentZ.x * currentZ.x - currentZ.y * currentZ.y, 2.0 * currentZ.x * currentZ.y) + c;

        if (escaped) {
            // n = i and z_n = currentZ
            float smoothedEscape = float(i) + 1.0 - log(log(length(currentZ))) / LOG_2;
            return EscapeTime(smoothedEscape, false);
        }
    }

    // If never escaped, return that it was infinite
    return EscapeTime(0.0, true);
}


vec2 windowToWorld(vec2 windowCoords) {
    vec2 worldCoords = camCenterWorld + (windowCoords - windowSizePixels * 0.5) * camWorldUnitsPerPixel;
    return worldCoords;
}

// For reprojection
vec2 worldToOldWindow(vec2 worldCoords) {
    // TODO
    return ((worldCoords - oldCamCenterWorld) / oldCamWorldUnitsPerPixel) + (windowSizePixels * 0.5);
}

// For SSAA
// Given (dx, dy) in [0, AA)^2, suppose the unit square [0, 1)^2 was cut up into AA equal
// partitions along each dimension. delta((dx, dy)) returns the center of the sub-square
// which is in the dy'th row and dx'th column (both 0-indexed).
vec2 delta(vec2 dxy) {
    // + 0.5 gets center of sub-square, divide by AA to normalize
    return (dxy + 0.5) / float(AA);
}

// For reprojection
float getAlpha(EscapeTime escapeTime) {
    float trueMax = float(TRUE_MAX_ITERS);
    float progress = clamp(float(MAX_ITERS) / trueMax, 0.0, 1.0);

    // A non-escaping sample is only reliable as MAX_ITERS approaches its limit
    float sampleAlpha = progress;

    if (!escapeTime.isInf) {
        float iterFraction = clamp(escapeTime.iters / trueMax, 0.0, 1.0);
        sampleAlpha = MIN_ALPHA + (1.0 - MIN_ALPHA) * iterFraction;
    }

    return sampleAlpha + (1.0 - sampleAlpha) * progress;
}


void main() {
    // gl_FragCoord.xy = this pixels position in window
    // use bottom left corner of pixel because using the center would cause the samples to be shifted
    vec2 pixelCorner = floor(gl_FragCoord.xy);  // Floor gets bottom left corner
    vec4 colourSum = vec4(0.0);

    for (int y = 0; y < AA; y++) {
        for (int x = 0; x < AA; x++) {
            vec2 sampleCoords = pixelCorner + delta(vec2(x, y));  // offset by delta
            vec2 z = windowToWorld(sampleCoords);
            EscapeTime escapeTime = escapeTimeSmooth(z);
            vec4 sampleColor = vec4(0.0, 0.0, 0.0, 1.0); // black;

            if (!escapeTime.isInf) {
                sampleColor = colorTime(escapeTime.iters);
            }

            vec2 oldUV = worldToOldWindow(z) / windowSizePixels;  // old uv coordinates
            // Check if old uv coordinates were in the frame
            bool inOldFrame = (oldUV.x >= 0.0) && (oldUV.y >= 0.0) && (oldUV.x < 1.0) && (oldUV.y < 1.0);

            if (prevFrame && inOldFrame) {
                // prev frame exists and oldUV is in the frame - sample old frame
                vec4 oldColor = texture2D(oldFrame, oldUV);
                float alpha = getAlpha(escapeTime);
                sampleColor = (oldColor * (1.0 - alpha)) + (sampleColor * alpha);
            }

            colourSum += sampleColor;
        }
    }

    gl_FragColor = colourSum / float(TOTAL_SAMPLES);
}