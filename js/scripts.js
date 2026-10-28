async function setup()
{
    window.gl = document.querySelector('canvas').getContext('webgl2')
    const [vs, fs, scene] = await Promise.all([
        loadText('glsl/vertex_shader.glsl'),
        loadText('glsl/fragment_shader.glsl'),
        loadJSON('json/scene.json'),
    ])
    window.program = compile(vs, fs)
    gl.useProgram(program)
    prepareScene(scene)
    gl.enable(gl.DEPTH_TEST)
    window.addEventListener('resize', fillScreen)
    fillScreen()
    tick(0)
}

/**
 * Compiles two shaders, links them together, looks up their uniform locations,
 * and returns the result. Reports any shader errors to the console.
 *
 * @param {string} vs_source - the source code of the vertex shader
 * @param {string} fs_source - the source code of the fragment shader
 * @return {WebGLProgram} the compiled and linked program
 */
function compile(vs_source, fs_source) {
    const vs = gl.createShader(gl.VERTEX_SHADER)
    gl.shaderSource(vs, vs_source)
    gl.compileShader(vs)
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(vs))
        throw Error("Vertex shader compilation failed")
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)
    gl.shaderSource(fs, fs_source)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(fs))
        throw Error("Fragment shader compilation failed")
    }

    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program))
        throw Error("Linking failed")
    }
    
    const uniforms = {}
    for(let i=0; i<gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i+=1) {
        let info = gl.getActiveUniform(program, i)
        uniforms[info.name] = gl.getUniformLocation(program, info.name)
    }
    program.uniforms = uniforms

    return program
}

function prepareScene(scene)
{
    const byName = {}
    for (const body of scene.bodies) {
        byName[body.name] = body
        body.orbitOmega = body.orbitPeriod ? 2 * Math.PI / body.orbitPeriod : 0
        body.spinOmega = body.spinPeriod ? 2 * Math.PI / body.spinPeriod : 0
        body.meshData = scene.meshes[body.mesh]
    }
    for (const body of scene.bodies) {
        body.parent = body.parent ? byName[body.parent] : null
    }
    window.scene = scene
    window.view = m4view(scene.camera.eye, scene.camera.center, scene.camera.up)
    for (const mesh of Object.values(scene.meshes)) uploadMesh(mesh)
}

function uploadMesh(mesh)
{
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)

    const positions = new Float32Array(mesh.positions.flat())
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(0)

    const colors = new Float32Array(mesh.colors.flat())
    const colorBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(1)

    const indices = new Uint16Array(mesh.indices.flat())
    const indexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    mesh.vao = vao
    mesh.count = indices.length
}

function fillScreen()
{
    const canvas = document.querySelector('canvas')
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
    canvas.style.width = '100vw'
    canvas.style.height = '100vh'
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight
    canvas.style.width = ''
    canvas.style.height = ''
    gl.viewport(0, 0, canvas.width, canvas.height)
    const cam = scene.camera
    window.proj = m4perspNegZ(cam.near, cam.far, cam.fovy, canvas.width, canvas.height)
}

/**
 * Placement is the orbit chain only. Children inherit that, not spin or scale.
 * A spin relative to the parent sits just left of scale: placement * Rspin * S.
 * Tidally locked moons omit that spin, so the orbit rotation keeps one face inward.
 */
function bodyMatrices(body, t, cache)
{
    const cached = cache.get(body)
    if (cached) return cached

    const orbit = m4mul(
        m4rotY(body.orbitOmega * t),
        m4trans(body.orbitRadius, 0, 0)
    )
    const placement = body.parent
        ? m4mul(bodyMatrices(body.parent, t, cache).placement, orbit)
        : orbit
    const scale = m4scale(body.scale, body.scale, body.scale)
    const model = body.tidalLock
        ? m4mul(placement, scale)
        : m4mul(placement, m4rotY(body.spinOmega * t), scale)
    const record = { placement, model }
    cache.set(body, record)
    return record
}

function tick(milliseconds)
{
    const t = milliseconds * 0.001
    const cache = new Map()

    gl.clearColor(0.02, 0.02, 0.06, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    for (const body of scene.bodies) {
        const model = bodyMatrices(body, t, cache).model
        gl.uniformMatrix4fv(program.uniforms.uMvp, false, m4mul(proj, view, model))
        gl.bindVertexArray(body.meshData.vao)
        gl.drawElements(gl.TRIANGLES, body.meshData.count, gl.UNSIGNED_SHORT, 0)
    }

    requestAnimationFrame(tick)
}

async function loadText(path)
{
    const res = await fetch(path)
    if (!res.ok)
    {
        throw Error('Failed to load ' + path + ' (open this page via http://localhost, not as a file)')
    }
    return res.text()
}

async function loadJSON(path)
{
    const res = await fetch(path, { cache: 'no-store' })
    if (!res.ok)
    {
        throw Error('Failed to load ' + path + ' (open this page via http://localhost, not as a file)')
    }
    return res.json()
}

window.addEventListener('load', setup)
