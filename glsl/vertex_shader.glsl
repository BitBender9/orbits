#version 300 es
uniform mat4 uMvp;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;
out vec3 vColor;
void main() {
    gl_Position = uMvp * vec4(aPosition, 1.0);
    vColor = aColor;
}
