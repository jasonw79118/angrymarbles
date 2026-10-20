// Test-only entry point: production Worker routing has no seed endpoint.
import worker from '../../worker/index';
import {GameRoom as ActualGameRoom} from '../../worker/GameRoom';
export default worker;
export class GameRoom extends ActualGameRoom {
  async fetch(request:Request):Promise<Response>{
    if(new URL(request.url).pathname==='/__seed'){
      const room=await request.json();
      await (this as any).state.storage.deleteAlarm();
      await (this as any).state.storage.put('room',room);
      return Response.json({ok:true});
    }
    return super.fetch(request);
  }
}
