//! © 2015 Nathan Rugg <nmrugg@gmail.com> | MIT
/// See LICENSE for more details.

/// Let's use Web Workers.
///NOTE: The "this" keyword is the global context ("window" variable) if loaded via a <script> tag
///      or the function context if loaded as a module (e.g., in Node.js).


// Base on `https://webpack.js.org/configuration/output/`
(function umdDefinition(factory) {
    
    // CFH - in case we want to expose this globally later on
    const root = (typeof globalThis !== "undefined") ? globalThis :
        (typeof window !== "undefined") ? window :
        (typeof global !== "undefined") ? global :
        null;
    
    if (typeof exports === 'object' && typeof module === 'object')
        module.exports = factory();
    else if (typeof exports === 'object')
        exports['LZMA'] = factory();
    else
        root['LZMA'] = factory();
})(function () {
    
    const LZMA = function (lzma_path) {
        var action_compress   = 1;
        var action_decompress = 2;
        var action_progress   = 3;
        
        var callback_obj = {};
            
        ///NOTE: Node.js needs something like "./" or "../" at the beginning.
        var lzma_worker = new Worker(lzma_path || "./lzma_worker-min.js");
        
        /*
        2020-06-17
        Quick and dirty fix for error handling. The lzma worker just throws errors without passing
        back the `data.callback_num` that it belongs to so we don't actually know which request failed.
        
        However, we effectively create a new worker for every encode/decode request so we can treat
        this as being a one-shot thing, keep track of the last callback id that was generated and
        assume that the error belongs to that id.
        */
        var last_callback_num = 0;
        
        lzma_worker.onmessage = function (e) {
            if (e.data.action === action_progress) {
                if (callback_obj[e.data.callback_num] && typeof callback_obj[e.data.callback_num].on_progress === "function") {
                    callback_obj[e.data.callback_num].on_progress(e.data.result);
                }
            } else {
                if (callback_obj[e.data.callback_num] && typeof callback_obj[e.data.callback_num].on_finish === "function") {
                    callback_obj[e.data.callback_num].on_finish(e.data.result);
                    
                    /// Since the (de)compression is complete, the callbacks are no longer needed.
                    delete callback_obj[e.data.callback_num];
                }
            }
        };
        
        /// Very simple error handling.
        lzma_worker.onerror = function(event) {
            if (callback_obj[last_callback_num] && typeof callback_obj[last_callback_num].on_error === "function") {
                var error = new Error(event.message + " (" + event.filename + ":" + event.lineno + ")");
                callback_obj[last_callback_num].on_error(error);
                
                /// Since the (de)compression is complete, the callbacks are no longer needed.
                delete callback_obj[last_callback_num];
            }
        };
        
        return (function () {
            
            function send_to_worker(action, data, mode, on_finish, on_progress, on_error) {
                var callback_num;
                
                do {
                    callback_num = Math.floor(Math.random() * (10000000));
                } while(typeof callback_obj[callback_num] !== "undefined");
                
                // keep track of callback id
                last_callback_num = callback_num;
                
                callback_obj[callback_num] = {
                    on_finish:   on_finish,
                    on_progress: on_progress,
                    on_error: on_error
                };
                
                lzma_worker.postMessage({
                    action:       action,
                    callback_num: callback_num,
                    data:         data,
                    mode:         mode
                });
            }
            
            return {
                /**
                 * Promise-based versions of compress/decompress.
                 * 
                 * @since v2.1.x
                 */
                compressP: function compressP(string, mode){
                    return new Promise(function(resolve, reject){
                        function on_finish(result){
                            resolve(result);
                        }
                        var on_progress = null;
                        function on_error(error){
                            reject(error);
                        }
                        send_to_worker(action_compress, String(string), mode, on_finish, on_progress, on_error);
                    });
                },
                decompressP: function decompressP(byte_arr){
                    return new Promise(function(resolve, reject){
                        function on_finish(result/*: string | false*/){
                            resolve(result);
                        }
                        var on_progress = null;
                        function on_error(error){
                            reject(error);
                        }
                        send_to_worker(action_decompress, byte_arr, false, on_finish, on_progress, on_error);
                    });
                },
    
                /**
                 * Callback-based functions
                 * 
                 * `on_error` available since v2.1.x
                 */
                compress: function compress(string, mode, on_finish, on_progress, on_error) {
                    send_to_worker(action_compress, String(string), mode, on_finish, on_progress, on_error);
                },
                decompress: function decompress(byte_arr, on_finish, on_progress, on_error) {
                    send_to_worker(action_decompress, byte_arr, false, on_finish, on_progress, on_error);
                }
            };
        }());
    };
    
    return LZMA;
});


