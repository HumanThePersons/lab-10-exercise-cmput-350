#version 120 

uniform sampler2D toCopy;
uniform vec2 windowSizePixels;

void main() {
    // TODO (reprojection)
    gl_FragColor = texture2D(toCopy, gl_FragCoord.xy / windowSizePixels);
}
