import asyncio
import websockets

async def test_ws():
    uri = "ws://127.0.0.1:8000/ws/player1"
    async with websockets.connect(uri) as websocket:
        await websocket.send("Hello from player1!")
        response = await websocket.recv()
        print(response)

asyncio.run(test_ws())
