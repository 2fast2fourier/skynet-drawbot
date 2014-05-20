var SerialPort = require("serialport").SerialPort;

var MAX_SPEED = 1200;

//Commands
var COMMAND_KEY = 33;
var COMMAND_TRANSFER_START = 35;
var COMMAND_TRANSFER_END = 36;
var COMMAND_EXECUTE = 37;

var CMD_DRIVE = 64;
var CMD_DRIVE_SPS = 65;
var CMD_ARM_EXTEND = 67;
var CMD_ARM_RETRACT = 68;

// var testData = '[{"y":[100,100,-100,-100],"x":[100,-100,-100,100]},{"y":[-500,-500,500,500],"x":[500,-500,-500,500]},{"y":[1000,-1000,-1000,1000],"x":[1000,1000,-1000,-1000]}]';
//
// var serialPort = new SerialPort("/dev/tty.linvor-DevB", {
//   baudRate: 9600
// });
// serialPort.on("open", function(){
//   var lineData = generateLineData(testData);
//   console.log("serial open", serialPort);
//   serialPort.on('data', function(data) {
//     console.log('data received',data);
//   });
//   serialPort.write(lineData, function(err, results) {
//     console.log('err', err);
//     console.log('results', results);
//   });
// });

function Plugin(messenger, options){
  this.messenger = messenger;
  this.options = options;
  return this;
}

var optionsSchema = {
  type: 'object',
  properties: {
    comPort: {
      type: 'string',
      required: true
    }
  }
};

var messageSchema = {
  type: 'object',
  properties: {
    lineData: {
      type: 'string',
      required: true
    }
  }
};

Plugin.prototype.onMessage = function(message){
  var data = message.message || message.payload;
  console.log(this.options.comPort, message.fromUuid, data);
  if(this.options.comPort && data.lineData){
    var serialPort = new SerialPort(this.options.comPort, {
      baudrate: 9600
    });
    var lineData = generateLineData(data.lineData);
    serialPort.on("open", function(err){
      console.log("serial open", serialPort, err);
      serialPort.on('data', function(data) {
        console.log('data received',data);
      });
      serialPort.write(lineData, function(err, results) {
        console.log('serial write', results, err);
        serialPort.drain(function(){
          console.log('closing port', serialPort);
          serialPort.close();
        });
      });
    });
  }else{
    console.log("ERROR: no com port specified or missing payload data.");
  }

};

Plugin.prototype.destroy = function(){
  //clean up
  console.log('destroying.', this.options);
};

function generateLineData(lineJSON){
  var lineArray = JSON.parse(lineJSON);
  var line;
  var cx = 0, cy = 0, dx, dy;
  var ix, iy, len = 0;
  var buffer = new Buffer(1024);
  console.log('transfer start');
  len = writeCommand(buffer, len, COMMAND_TRANSFER_START);
  len = writeData2S(buffer, len, CMD_DRIVE_SPS, MAX_SPEED, MAX_SPEED);
  for(ix = 0; ix < lineArray.length; ix++){
    line = lineArray[ix];
    if(line.x.length > 0 && line.x.length == line.y.length){
      dx = line.x[0];
      dy = line.y[0];
      console.log('move to point @', dx, dy);
      len = writeDrive(buffer, len, cx, cy, dx, dy);
      cx = dx;
      cy = dy;
      console.log('arm down @', cx, cy);
      len = writeData(buffer, len, CMD_ARM_EXTEND);
      for(iy = 0; iy < line.x.length; iy++){
        dx = line.x[iy];
        dy = line.y[iy];
        len = writeDrive(buffer, len, cx, cy, dx, dy);
        cx = dx;
        cy = dy;
      }
      console.log('arm up @', cx, cy);
      len = writeData(buffer, len, CMD_ARM_RETRACT);
    }
  }
  dx = 0;
  dy = 0;
  console.log('move home @', dy, dx);
  len = writeDrive(buffer, len, cx, cy, dx, dy);
  cx = dx;
  cy = dy;
  console.log('transfer end');
  len = writeData(buffer, len, COMMAND_TRANSFER_END);
  console.log('execute');
  len = writeCommand(buffer, len, COMMAND_EXECUTE);
  console.log("data", buffer);
  return buffer.slice(0, len);
}

function writeDrive(buffer, len, cx, cy, dx, dy, draw){
  var sx = (cx-dx)+(cy-dy);
  var sy = (cx-dx)-(cy-dy);
  console.log('move by',sx,sy);
  return writeData2S(buffer, len, CMD_DRIVE, sx, sy);
}

function writeCommand(buffer, len, command){
  buffer.writeInt8(COMMAND_KEY, len);
  len++;
  buffer.writeInt8(command, len);
  len++;
  buffer.writeUInt8(0, len);
  len++;
  buffer.writeUInt8(0, len);
  len++;
  buffer.writeUInt8(0, len);
  return len+1;
}

function writeData2S(buffer, len, command, data1, data2){
  buffer.writeInt8(command, len);
  len++;
  buffer.writeInt16BE(data1, len);
  len+=2;
  buffer.writeInt16BE(data2, len);
  return len+2;
}

function writeData1S(buffer, len, command, data){
  buffer.writeInt8(command, len);
  len++;
  buffer.writeInt16BE(data, len);
  len+=2;
  buffer.writeInt16BE(0, len);
  return len+2;
}

function writeData(buffer, len, command){
  buffer.writeInt8(command, len);
  len++;
  buffer.writeInt16BE(0, len);
  len+=2;
  buffer.writeInt16BE(0, len);
  return len+2;
}

module.exports = {
  Plugin: Plugin,
  optionsSchema: optionsSchema,
  messageSchema: messageSchema
};
